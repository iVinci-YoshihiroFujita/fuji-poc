#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { SentimentAnalysisStack } from "../lib/emotion-analysis/sentiment-analysis-stack";

const app = new cdk.App();
new SentimentAnalysisStack(app, "EmotionAnalysisStack");
