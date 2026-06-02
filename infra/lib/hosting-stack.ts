import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as targets from 'aws-cdk-lib/aws-route53-targets';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as path from 'path';

interface HostingStackProps extends cdk.StackProps {
  stage: string;
  domainName: string;   // unizikbuilders.tech
  appSubdomain: string; // aws.unizikbuilders.tech
}

/**
 * Static hosting for both surfaces.
 *  - apex (unizikbuilders.tech)      -> the hub landing page
 *  - aws. subdomain                  -> the React membership app (SPA)
 * Each gets its own private S3 bucket (no public access), fronted by its own
 * CloudFront distribution using Origin Access Control. TLS via ACM, DNS via
 * Route 53. The app distribution rewrites 403/404 to index.html so client-side
 * routing works.
 *
 * NOTE: CloudFront requires its ACM certs in us-east-1. Deploy this stack there,
 * or use a DnsValidatedCertificate. Keeping it explicit here.
 */
export class HostingStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: HostingStackProps) {
    super(scope, id, props);
    const isProd = props.stage === 'prod';
    const removal = isProd ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY;

    const zone = route53.HostedZone.fromLookup(this, 'Zone', {
      domainName: props.domainName,
    });

    const cert = new acm.Certificate(this, 'Cert', {
      domainName: props.domainName,
      subjectAlternativeNames: [props.appSubdomain],
      validation: acm.CertificateValidation.fromDns(zone),
    });

    // ---- Landing (apex) ----
    const landingBucket = new s3.Bucket(this, 'LandingBucket', {
      bucketName: `asbu-landing-${props.stage}-${this.account}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      removalPolicy: removal,
      autoDeleteObjects: !isProd,
    });

    const landingDist = new cloudfront.Distribution(this, 'LandingDist', {
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(landingBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
      },
      domainNames: [props.domainName],
      certificate: cert,
      defaultRootObject: 'index.html',
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
    });

    new route53.ARecord(this, 'LandingAlias', {
      zone,
      recordName: props.domainName,
      target: route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(landingDist)),
    });

    // ---- App (aws. subdomain) ----
    const appBucket = new s3.Bucket(this, 'AppBucket', {
      bucketName: `asbu-app-${props.stage}-${this.account}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      removalPolicy: removal,
      autoDeleteObjects: !isProd,
    });

    const appDist = new cloudfront.Distribution(this, 'AppDist', {
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(appBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
      },
      domainNames: [props.appSubdomain],
      certificate: cert,
      defaultRootObject: 'index.html',
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
      // SPA routing: send 403/404 back to index.html so React Router handles the path.
      errorResponses: [
        { httpStatus: 403, responseHttpStatus: 200, responsePagePath: '/index.html', ttl: cdk.Duration.minutes(5) },
        { httpStatus: 404, responseHttpStatus: 200, responsePagePath: '/index.html', ttl: cdk.Duration.minutes(5) },
      ],
    });

    new route53.ARecord(this, 'AppAlias', {
      zone,
      recordName: props.appSubdomain,
      target: route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(appDist)),
    });

    // ---- Deploy landing assets (the app's dist/ is deployed via CI after build) ----
    new s3deploy.BucketDeployment(this, 'DeployLanding', {
      sources: [s3deploy.Source.asset(path.join(__dirname, '..', '..', 'landing'))],
      destinationBucket: landingBucket,
      distribution: landingDist,
      distributionPaths: ['/*'],
    });

    new cdk.CfnOutput(this, 'LandingUrl', { value: `https://${props.domainName}` });
    new cdk.CfnOutput(this, 'AppUrl', { value: `https://${props.appSubdomain}` });
    new cdk.CfnOutput(this, 'AppBucketName', { value: appBucket.bucketName });
    new cdk.CfnOutput(this, 'AppDistributionId', { value: appDist.distributionId });
  }
}
