---
description: Deploy GeminiPress to Google Cloud Run
---

This workflow deploys the application to Google Cloud Run in the europe-west1 region.

# Prerequisites
- Google Cloud SDK (`gcloud`) installed and initialized.
- Access to the project with ID `919868300168`.

# Deployment Steps

1.  **Set the Project ID**
    Ensure we are targeting the correct project.
    ```powershell
    gcloud config set project 919868300168
    ```

2.  **Deploy to Cloud Run**
    Deploy the source directly to Cloud Run. This builds the container using Cloud Build and deploys it.
    *(Note: You will be prompted to confirm creating the service if it doesn't exist, and to allow unauthenticated invocations).*
    ```powershell
    gcloud run deploy geminipress --source . --region europe-west1 --allow-unauthenticated
    ```

3.  **Verify Deployment**
    Get the service URL to confirm it matches the target.
    ```powershell
    gcloud run services describe geminipress --region europe-west1 --format "value(status.url)"
    ```
