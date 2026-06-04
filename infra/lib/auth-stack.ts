import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as path from 'path';

interface AuthStackProps extends cdk.StackProps {
  stage: string;
}

/**
 * Identity.
 *  - Email + password sign-up, with email verification.
 *  - Google sign-in, but only wired if Google creds are passed via context
 *    (-c googleClientId=... -c googleClientSecret=...) so the stack deploys
 *    cleanly before I've set Google up.
 *  - An 'admin' group. Admin status is a signed claim in the token, checked
 *    server-side — never decided in the browser.
 */
export class AuthStack extends cdk.Stack {
  public readonly userPool: cognito.UserPool;
  public readonly userPoolClient: cognito.UserPoolClient;

  constructor(scope: Construct, id: string, props: AuthStackProps) {
    super(scope, id, props);
    const isProd = props.stage === 'prod';

    // Account-linking pre-sign-up trigger (Python; infra/lambdas/). Created
    // before the pool so it can be attached as a trigger; IAM is granted after
    // the pool exists (see below).
    const preSignUpFn = new lambda.Function(this, 'PreSignUpLinkFn', {
      runtime: lambda.Runtime.PYTHON_3_12,
      code: lambda.Code.fromAsset(path.join(__dirname, '..', 'lambdas')),
      handler: 'pre_signup_link.handler',
      timeout: cdk.Duration.seconds(10),
      memorySize: 256,
      tracing: lambda.Tracing.ACTIVE,
    });

    this.userPool = new cognito.UserPool(this, 'UserPool', {
      userPoolName: `asbu-${props.stage}`,
      selfSignUpEnabled: true,
      signInAliases: { email: true },
      autoVerify: { email: true },
      standardAttributes: {
        email: { required: true, mutable: true },
        fullname: { required: false, mutable: true },
      },
      passwordPolicy: {
        minLength: 8,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: false,
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      removalPolicy: isProd ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
      lambdaTriggers: { preSignUp: preSignUpFn },
    });

    // Minimal Cognito permissions for the linking trigger. Scoped to user pools
    // in this account/region rather than this.userPool.userPoolArn: the pool
    // already depends on the function (as its trigger), so referencing the pool
    // ARN back in the function's role would create a circular dependency. The
    // handler only ever acts on the pool it's invoked for (event.userPoolId).
    preSignUpFn.addToRolePolicy(new iam.PolicyStatement({
      actions: ['cognito-idp:ListUsers', 'cognito-idp:AdminLinkProviderForUser'],
      resources: [cdk.Arn.format(
        { service: 'cognito-idp', resource: 'userpool', resourceName: '*' }, this,
      )],
    }));

    // Optional Google federation.
    const googleClientId = this.node.tryGetContext('googleClientId');
    const googleClientSecret = this.node.tryGetContext('googleClientSecret');
    const providers: cognito.UserPoolClientIdentityProvider[] = [
      cognito.UserPoolClientIdentityProvider.COGNITO,
    ];
    let google: cognito.UserPoolIdentityProviderGoogle | undefined;

    if (googleClientId && googleClientSecret) {
      google = new cognito.UserPoolIdentityProviderGoogle(this, 'Google', {
        userPool: this.userPool,
        clientId: googleClientId,
        clientSecretValue: cdk.SecretValue.unsafePlainText(googleClientSecret),
        // Scope order mirrors the existing console-created provider
        // ("profile email openid"). OAuth treats scopes as a set, so order is
        // cosmetic — matched here only so the IaC definition is byte-identical.
        scopes: ['profile', 'email', 'openid'],
        attributeMapping: {
          email: cognito.ProviderAttribute.GOOGLE_EMAIL,
          fullname: cognito.ProviderAttribute.GOOGLE_NAME,
        },
      });
      // Cognito's Google provider also maps username -> sub by default, and the
      // console-created provider has it. The high-level attributeMapping has no
      // `username` field, so set it on the L1 child to mirror live exactly.
      (google.node.defaultChild as cognito.CfnUserPoolIdentityProvider)
        .addPropertyOverride('AttributeMapping.username', 'sub');
      providers.push(cognito.UserPoolClientIdentityProvider.GOOGLE);
    }

    const appBase = isProd ? 'https://aws.unizikbuilders.tech' : 'http://localhost:5173';

    this.userPoolClient = this.userPool.addClient('WebClient', {
      userPoolClientName: `asbu-web-${props.stage}`,
      generateSecret: false, // public SPA client
      oAuth: {
        flows: { authorizationCodeGrant: true },
        scopes: [cognito.OAuthScope.OPENID, cognito.OAuthScope.EMAIL, cognito.OAuthScope.PROFILE],
        callbackUrls: [`${appBase}/callback`],
        logoutUrls: [appBase],
      },
      supportedIdentityProviders: providers,
      accessTokenValidity: cdk.Duration.hours(1),
      idTokenValidity: cdk.Duration.hours(1),
      refreshTokenValidity: cdk.Duration.days(30),
    });

    if (google) {
      this.userPoolClient.node.addDependency(google);
    }

    // Hosted/Managed Login domain.
    this.userPool.addDomain('Domain', {
      cognitoDomain: { domainPrefix: `asbu-${props.stage}-${this.account}` },
    });

    new cognito.CfnUserPoolGroup(this, 'AdminGroup', {
      userPoolId: this.userPool.userPoolId,
      groupName: 'admin',
      description: 'Club admins who can verify or reject new members',
    });

    new cdk.CfnOutput(this, 'UserPoolId', { value: this.userPool.userPoolId });
    new cdk.CfnOutput(this, 'UserPoolClientId', { value: this.userPoolClient.userPoolClientId });
    new cdk.CfnOutput(this, 'LoginDomain', {
      value: `asbu-${props.stage}-${this.account}.auth.${this.region}.amazoncognito.com`,
    });
  }
}
