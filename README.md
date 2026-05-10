# Smart Maintenance Assets Assistant

Production-ready maintenance tracker with AI-powered suggestions and Firestore persistence.

## 🚀 Deployment to GitHub

To deploy this app using GitHub:

1.  **Create a new repository** on GitHub at [https://github.com/sumberpocong/smart-maintenance-assets-assistant](https://github.com/sumberpocong/smart-maintenance-assets-assistant).
2.  **Push the code**:
    ```bash
    git remote add origin https://github.com/sumberpocong/smart-maintenance-assets-assistant.git
    git branch -M main
    git push -u origin main
    ```
3.  **Setup Secrets**:
    - Go to `Settings > Secrets and variables > Actions`.
    - Add `GCP_SA_KEY`: The JSON key of your Google Cloud Service Account with `Cloud Run Admin` and `Storage Admin` roles.

## 🛠 Features
- **AI Suggested Components**: Automatically predicts maintenance items based on asset name/category.
- **Dynamic Odometer Tracking**: Enforces readings for vehicles (Motor/Car, Manual/Matic).
- **Firestore Support**: Scalable data persistence on Google Cloud.
- **Premium UI**: Dark mode, custom modals, and smooth animations.

## 💻 Local Development
1. `npm install`
2. `cp .env.example .env` (Add your Gemini API Key)
3. `npm run dev`
