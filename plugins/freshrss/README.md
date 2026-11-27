# FreshRSS plugin

Displays your FreshRSS aggregated feed on the degoog home page and as a search slot.

## Setup

### 1. Enable the API in FreshRSS

FreshRSS ships with the API disabled. You need to turn it on once as an admin:

1. Log in as an admin and go to **Administration → Authentication**
2. Check **Allow API access** and save

### 2. Set your API password

The API uses a separate password from your login password:

1. Go to your **Profile** (top-right menu → your username)
2. Scroll to **API password**
3. Enter a password and save, this is what you put in the plugin settings, not your login password

### 3. Keep it private (optional)

Turn on **Gate behind auth** in the plugin settings and only people signed in to Settings see your feed and can mark articles as read. It's off by default.
