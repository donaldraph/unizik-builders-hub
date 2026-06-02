import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as s3 from 'aws-cdk-lib/aws-s3';

interface DataStackProps extends cdk.StackProps {
  stage: string;
}

/**
 * Storage layer.
 *  - One DynamoDB table, single-table design. PK/SK for direct lookups,
 *    GSI1 keyed on STATUS#<status> so the directory (VERIFIED) and the
 *    admin queue (PENDING) are each one query.
 *  - One S3 bucket for avatars. Never publicly writable; uploads come in
 *    through presigned URLs only.
 */
export class DataStack extends cdk.Stack {
  public readonly table: dynamodb.Table;
  public readonly avatarBucket: s3.Bucket;

  constructor(scope: Construct, id: string, props: DataStackProps) {
    super(scope, id, props);
    const isProd = props.stage === 'prod';

    this.table = new dynamodb.Table(this, 'Members', {
      tableName: `asbu-members-${props.stage}`,
      partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecovery: true, // member data is the one thing I can't regenerate
      removalPolicy: isProd ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
    });

    // Status index: list everyone VERIFIED (directory) or PENDING (admin), by join date.
    this.table.addGlobalSecondaryIndex({
      indexName: 'GSI1',
      partitionKey: { name: 'GSI1PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'GSI1SK', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    this.avatarBucket = new s3.Bucket(this, 'Avatars', {
      bucketName: `asbu-avatars-${props.stage}-${this.account}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      cors: [
        {
          allowedMethods: [s3.HttpMethods.PUT, s3.HttpMethods.GET],
          allowedOrigins: ['*'], // TODO: tighten to https://aws.unizikbuilders.tech in prod
          allowedHeaders: ['*'],
          maxAge: 3000,
        },
      ],
      removalPolicy: isProd ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: !isProd,
    });

    new cdk.CfnOutput(this, 'TableName', { value: this.table.tableName });
    new cdk.CfnOutput(this, 'AvatarBucketName', { value: this.avatarBucket.bucketName });
  }
}
