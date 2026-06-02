import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigw from 'aws-cdk-lib/aws-apigateway';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as wafv2 from 'aws-cdk-lib/aws-wafv2';
import * as path from 'path';

interface ApiStackProps extends cdk.StackProps {
  stage: string;
  table: dynamodb.Table;
  avatarBucket: s3.Bucket;
  userPool: cognito.UserPool;
}

/**
 * The API. Every route sits behind a Cognito authorizer, so a request
 * without a valid token never reaches the functions. Each Lambda is narrow
 * and gets only the table/bucket permissions it actually needs.
 */
export class ApiStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: ApiStackProps) {
    super(scope, id, props);
    const { table, avatarBucket, userPool } = props;

    const lambdasPath = path.join(__dirname, '..', 'lambdas');
    const commonEnv = {
      TABLE_NAME: table.tableName,
      AVATAR_BUCKET: avatarBucket.bucketName,
    };

    const makeFn = (name: string, handler: string) =>
      new lambda.Function(this, name, {
        runtime: lambda.Runtime.PYTHON_3_12,
        code: lambda.Code.fromAsset(lambdasPath),
        handler,
        timeout: cdk.Duration.seconds(10),
        memorySize: 256,
        environment: commonEnv,
        tracing: lambda.Tracing.ACTIVE, // X-Ray
      });

    const registerFn = makeFn('RegisterFn', 'register.handler');
    const getProfileFn = makeFn('GetProfileFn', 'get_profile.handler');
    const updateProfileFn = makeFn('UpdateProfileFn', 'update_profile.handler');
    const avatarUrlFn = makeFn('AvatarUrlFn', 'avatar_url.handler');
    const directoryFn = makeFn('DirectoryFn', 'list_directory.handler');
    const adminPendingFn = makeFn('AdminPendingFn', 'admin_pending.handler');
    const adminVerifyFn = makeFn('AdminVerifyFn', 'admin_verify.handler');

    // Least privilege: each function gets only what it needs.
    table.grantReadWriteData(registerFn);
    table.grantReadData(getProfileFn);
    table.grantReadWriteData(updateProfileFn);
    table.grantReadData(directoryFn);
    table.grantReadData(adminPendingFn);
    table.grantReadWriteData(adminVerifyFn);
    avatarBucket.grantPut(avatarUrlFn);
    // Read access so these can presign GET URLs for stored avatars.
    avatarBucket.grantRead(getProfileFn);
    avatarBucket.grantRead(directoryFn);
    avatarBucket.grantRead(adminPendingFn);

    const api = new apigw.RestApi(this, 'Api', {
      restApiName: `asbu-${props.stage}`,
      deployOptions: { stageName: props.stage, tracingEnabled: true },
      defaultCorsPreflightOptions: {
        allowOrigins: apigw.Cors.ALL_ORIGINS, // TODO: lock to app origin in prod
        allowMethods: apigw.Cors.ALL_METHODS,
        allowHeaders: ['Content-Type', 'Authorization'],
      },
    });

    const authorizer = new apigw.CognitoUserPoolsAuthorizer(this, 'Authorizer', {
      cognitoUserPools: [userPool],
    });
    const protect = {
      authorizer,
      authorizationType: apigw.AuthorizationType.COGNITO,
    };

    // /me — own profile
    const me = api.root.addResource('me');
    me.addMethod('GET', new apigw.LambdaIntegration(getProfileFn), protect);
    me.addMethod('PUT', new apigw.LambdaIntegration(updateProfileFn), protect);
    me.addResource('avatar-url').addMethod('POST', new apigw.LambdaIntegration(avatarUrlFn), protect);

    // /register — create my profile after sign-up (keyed to my token's sub)
    api.root.addResource('register').addMethod('POST', new apigw.LambdaIntegration(registerFn), protect);

    // /directory — public member list (private fields stripped server-side)
    api.root.addResource('directory').addMethod('GET', new apigw.LambdaIntegration(directoryFn), protect);

    // /admin — gated by the 'admin' group claim, checked inside the function
    const admin = api.root.addResource('admin');
    admin.addResource('pending').addMethod('GET', new apigw.LambdaIntegration(adminPendingFn), protect);
    admin.addResource('verify').addMethod('POST', new apigw.LambdaIntegration(adminVerifyFn), protect);

    // WAF — rate limit + AWS managed common rules, attached to the REST API stage.
    const webAcl = new wafv2.CfnWebACL(this, 'WebAcl', {
      scope: 'REGIONAL',
      defaultAction: { allow: {} },
      visibilityConfig: {
        cloudWatchMetricsEnabled: true,
        metricName: `asbu-${props.stage}-acl`,
        sampledRequestsEnabled: true,
      },
      rules: [
        {
          name: 'RateLimitPerIp',
          priority: 1,
          action: { block: {} },
          statement: { rateBasedStatement: { limit: 1000, aggregateKeyType: 'IP' } },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: 'rate-limit',
            sampledRequestsEnabled: true,
          },
        },
        {
          name: 'AWSCommonRules',
          priority: 2,
          overrideAction: { none: {} },
          statement: {
            managedRuleGroupStatement: { vendorName: 'AWS', name: 'AWSManagedRulesCommonRuleSet' },
          },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: 'aws-common',
            sampledRequestsEnabled: true,
          },
        },
      ],
    });

    new wafv2.CfnWebACLAssociation(this, 'WebAclAssociation', {
      resourceArn: api.deploymentStage.stageArn,
      webAclArn: webAcl.attrArn,
    });

    new cdk.CfnOutput(this, 'ApiUrl', { value: api.url });
  }
}
