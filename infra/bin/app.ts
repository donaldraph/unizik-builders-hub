#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { DataStack } from '../lib/data-stack';
import { AuthStack } from '../lib/auth-stack';
import { ApiStack } from '../lib/api-stack';
import { HostingStack } from '../lib/hosting-stack';

const app = new cdk.App();

// Stage drives naming and prod-vs-dev behaviour. Override with: cdk deploy --all -c stage=prod
const stage = app.node.tryGetContext('stage') || 'dev';

const env: cdk.Environment = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION || 'us-east-1',
};

const prefix = `asbu-${stage}`;

const data = new DataStack(app, `${prefix}-data`, { env, stage });
const auth = new AuthStack(app, `${prefix}-auth`, { env, stage });

new ApiStack(app, `${prefix}-api`, {
  env,
  stage,
  table: data.table,
  avatarBucket: data.avatarBucket,
  userPool: auth.userPool,
});

new HostingStack(app, `${prefix}-hosting`, {
  env,
  stage,
  domainName: 'unizikbuilders.tech',
  appSubdomain: 'aws.unizikbuilders.tech',
});

cdk.Tags.of(app).add('project', 'aws-student-builders-unizik');
cdk.Tags.of(app).add('stage', stage);
