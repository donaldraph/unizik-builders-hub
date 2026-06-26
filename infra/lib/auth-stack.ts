import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as kms from 'aws-cdk-lib/aws-kms';
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

    // KMS key for the CustomEmailSender trigger. Cognito encrypts every code and
    // temporary password with this key (AWS Encryption SDK envelope format)
    // before handing it to the sender Lambda, which decrypts it. Symmetric, as
    // Cognito requires.
    //
    // Cognito's permission to USE the key is NOT a static key-policy statement
    // for the service principal: at pool create/update the deploying principal
    // creates a one-time KMS grant for Cognito, so that principal needs
    // kms:CreateGrant on the key. The default key policy (account principals via
    // IAM) plus the CloudFormation execution role (AdministratorAccess in the
    // default CDK bootstrap) satisfies that. The Lambda gets kms:Decrypt
    // explicitly via grantDecrypt (see below).
    const customSenderKey = new kms.Key(this, 'CustomEmailSenderKey', {
      description: `asbu-${props.stage} Cognito custom email sender code encryption`,
      enableKeyRotation: true,
      removalPolicy: isProd ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
    });

    // CustomEmailSender trigger (Python; infra/lambdas/custom_email_sender.py).
    // Declared here, but NOT yet attached to the pool as a trigger (that's a
    // later step). It needs aws-encryption-sdk to decrypt Cognito's code, which
    // is not in the shared lambdas/ folder — it ships as a layer attached ONLY to
    // this function (build/ holds the python/ site-packages root the layer needs).
    const encryptionSdkLayer = new lambda.LayerVersion(this, 'EncryptionSdkLayer', {
      code: lambda.Code.fromAsset(path.join(__dirname, '..', 'layers', 'encryption-sdk', 'build')),
      compatibleRuntimes: [lambda.Runtime.PYTHON_3_12],
      description: 'AWS Encryption SDK for the CustomEmailSender trigger',
    });

    const customEmailSenderFn = new lambda.Function(this, 'CustomEmailSenderFn', {
      runtime: lambda.Runtime.PYTHON_3_12,
      code: lambda.Code.fromAsset(path.join(__dirname, '..', 'lambdas')),
      handler: 'custom_email_sender.handler',
      timeout: cdk.Duration.seconds(10),
      memorySize: 256,
      tracing: lambda.Tracing.ACTIVE,
      layers: [encryptionSdkLayer],
      environment: {
        CUSTOM_SENDER_KMS_KEY_ARN: customSenderKey.keyArn,
      },
    });

    // Let the sender decrypt the codes Cognito encrypts with this key.
    customSenderKey.grantDecrypt(customEmailSenderFn);

    // Resend API key, wired exactly as api-stack does for admin_verify: passed via
    // CDK context (-c resendApiKey=...) so it never lands in committed source.
    const resendApiKey = this.node.tryGetContext('resendApiKey');
    if (resendApiKey) {
      customEmailSenderFn.addEnvironment('RESEND_API_KEY', resendApiKey);
    }

    this.userPool = new cognito.UserPool(this, 'UserPool', {
      userPoolName: `asbu-${props.stage}`,
      selfSignUpEnabled: true,
      signInAliases: { email: true },
      autoVerify: { email: true },
      // Send Cognito's own emails (sign-up verification code, forgot-password)
      // through SES from our verified domain instead of Cognito's default
      // generic sender. withSES() sets emailSendingAccount = DEVELOPER and wires
      // the IAM grant that lets Cognito call ses:SendEmail on the identity.
      //
      // The domain unizikbuilders.tech is already a verified SES identity in
      // us-east-1 (DKIM/SPF/DMARC done). A verified DOMAIN identity covers every
      // address @ that domain, so no-reply@unizikbuilders.tech needs NO separate
      // address verification. sesVerifiedDomain tells CDK which identity ARN to
      // scope the Cognito send-permission to.
      //
      // NOTE: do not deploy until SES production access is granted — while in
      // the sandbox Cognito's SES sends will fail for unverified recipients.
      email: cognito.UserPoolEmail.withSES({
        fromEmail: 'no-reply@unizikbuilders.tech',
        // Friendly display name shown to recipients.
        fromName: 'AWS Student Builders UNIZIK',
        sesRegion: 'us-east-1',
        sesVerifiedDomain: 'unizikbuilders.tech',
      }),
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
      // CustomEmailSender takes over ALL Cognito email: with this trigger
      // attached Cognito stops sending itself and instead invokes the function
      // with each code encrypted under customSenderKmsKey. The withSES() config
      // above stays as the declared fallback identity but is no longer the send
      // path. Cognito creates a one-time KMS grant for itself at pool
      // create/update (the CFN execution role authorizes that — see the key's
      // comment); the function holds kms:Decrypt via the grant added in Step 4.
      lambdaTriggers: {
        preSignUp: preSignUpFn,
        customEmailSender: customEmailSenderFn,
      },
      customSenderKmsKey: customSenderKey,
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
