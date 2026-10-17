# Virtual Public Artboard

A stateful, multi-client, black & white public artboard server built with Node.js.  
This project is a standalone port of the arduino based [IDC - I2C Display Controller](https://github.com/mwdle/IDC).

Visit [vpa.mwdle.com](https://vpa.mwdle.com) to try it out!

Temporary notes to self to add to README until I get a chance to fix and update this readme:

- When using file count limit, folders must contain only files created by VPA
- Make note about generating integrity hashes for all scripts and styles loaded from html file: `openssl dgst -sha384 -binary script.js | openssl base64 -A`
- Make note about trusted proxy range
