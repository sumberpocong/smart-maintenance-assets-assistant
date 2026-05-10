#!/bin/bash

# Configuration
PROJECT_ID=$(gcloud config get-value project)
SERVICE_NAME="smart-maintenance-assets"
REGION="us-central1"

echo "Deploying to Cloud Run in project $PROJECT_ID..."

# Build and deploy in one step using Cloud Run source deployment
# This automatically builds the container using the Dockerfile and deploys it
gcloud run deploy $SERVICE_NAME \
  --source . \
  --region $REGION \
  --allow-unauthenticated \
  --set-env-vars="USE_FIRESTORE=true,NODE_ENV=production,FIRESTORE_DATABASE_ID=juara-gimmick" \
  --max-instances=5 \
  --memory=256Mi \
  --cpu=1

echo "Deployment complete!"
