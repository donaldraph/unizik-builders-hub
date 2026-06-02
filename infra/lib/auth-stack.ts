import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as cognito from 'aws-cdk-lib/aws-cognito';

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
    });

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
        scopes: ['openid', 'email', 'profile'],
        attributeMapping: {
          email: cognito.ProviderAttribute.GOOGLE_EMAIL,
          fullname: cognito.ProviderAttribute.GOOGLE_NAME,
        },
      });
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
