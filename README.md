# 📚 KDP-Factory Visitor Bookshelf

A beautiful, read-only static bookshelf designed for **Doc William** to search, browse, download, and play audiobook chapters of KDP-Factory completed books.

Because all book assets (EPUB, DOCX, and MP3 files) are stored on your **Google Drive**, this page is completely static and can be hosted for free on **GitHub Pages**, Vercel, Netlify, or any static host of your choice. No python server or database is required to keep it online!

---

## 🔒 Crucial Pre-requisite: Google Drive Permissions

To allow Doc William's browser to download books and stream the audio tracks directly from Google Drive:
1. Open your **Google Drive**.
2. Locate the main output folder (e.g., `KDP-Factory Outputs`).
3. Right-click the folder, select **Share**, and set the general access to **"Anyone with the link can view"** (Viewer).
> [!IMPORTANT]
> If the Google Drive folder/files are kept private, Doc William's browser will be blocked from playing or downloading the assets (returning HTTP 403/404 errors).

---

## 🚀 How to Set Up and Update the Bookshelf

### Step 1: Compile the Data
Whenever a new book is generated or synchronized to Google Drive, run the compilation script from the root of your `kdp-factory` project:
```bash
python3 scripts/generate_visitor_data.py
```
This script will:
* Exchange your refresh tokens for a fresh Google Drive API token.
* Read the local `sync_results.json` mapping files.
* Query the Google Drive API to retrieve the direct file IDs of your EPUBs, DOCXs, and MP3 audiobook tracks.
* Write a tiny metadata file `books.json` inside the `visitor/` folder.

---

## 🌐 Deploying to GitHub Pages ("Git Webpage")

There are two easy options to host this bookshelf:

### Option A: Create a standalone Git repository (Recommended)
1. Initialize the `visitor` directory as a Git repository:
   ```bash
   cd dashboard/visitor
   git init
   ```
2. Create a new repository on GitHub (e.g., named `kdp-bookshelf`).
3. Commit the files and push them to your new repository:
   ```bash
   git add .
   git commit -m "Initial visitor bookshelf setup"
   git remote add origin https://github.com/YOUR_USERNAME/kdp-bookshelf.git
   git branch -M main
   git push -u origin main
   ```
4. On your GitHub repository page:
   * Go to **Settings** > **Pages**.
   * Under **Build and deployment**, set **Source** to **Deploy from a branch**.
   * Select the `main` branch and root `/` folder, then click **Save**.
5. Within 1-2 minutes, GitHub will give you a public URL (e.g., `https://YOUR_USERNAME.github.io/kdp-bookshelf/`) to share with Doc William!

### Option B: Keep it in a monorepo
If you have a repository for the entire `kdp-factory` project, you can simply commit the `dashboard/visitor/` directory and configure GitHub Pages to serve from the `dashboard/visitor` folder of your repository.

---

## 🔄 Keeping the Bookshelf Updated

Whenever a new book completes, simply re-run the compilation script and commit the updated `books.json` file:
```bash
# Compile latest Drive IDs
python3 scripts/generate_visitor_data.py

# Push update to GitHub
cd dashboard/visitor
git add books.json
git commit -m "Update available books list"
git push
```
The live website will automatically update in a few seconds!
