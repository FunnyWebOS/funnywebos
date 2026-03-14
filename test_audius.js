
const https = require('https');
https.get('https://discoveryprovider.audius.co/v1/tracks/search?query=eminem&app_name=spotaether', (res) => {
    let raw = '';
    res.on('data', chunk => raw += chunk);
    res.on('end', () => console.log(JSON.parse(raw).data[0].title));
});

