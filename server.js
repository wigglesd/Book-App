'use strict';

const path = require('path');
const { createApp } = require('./src/app');
const { createStore } = require('./src/store');
const { createLookup } = require('./src/lookup');
const { createAuth } = require('./src/auth');

const ownerPassword = process.env.OWNER_PASSWORD;
if (!ownerPassword) {
  console.error('Set OWNER_PASSWORD to the password you will use to edit your lists.');
  process.exit(1);
}

const app = createApp({
  store: createStore(process.env.DATA_FILE || path.join(__dirname, 'data', 'books.json')),
  lookup: createLookup({ googleApiKey: process.env.GOOGLE_BOOKS_API_KEY }),
  auth: createAuth(ownerPassword),
  ownerName: process.env.OWNER_NAME || 'the owner',
});

// Behind a reverse proxy (needed for HTTPS, which phone cameras require).
app.set('trust proxy', true);

const port = Number(process.env.PORT) || 3000;
app.listen(port, () => console.log(`Book App running on http://localhost:${port}`));
