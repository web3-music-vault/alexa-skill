const https = require('https')

function httpGet(accessToken) {
  return new Promise(((resolve, reject) => {
    var options = {
        host: 'www.web3musicvault.xyz',
        port: 443,
        path: '/api/library',
        method: 'GET',
        headers:{"Authorization":"Bearer "+accessToken}
    };
    
    const request = https.request(options, (response) => {
      response.setEncoding('utf8');
      let returnData = '';

      response.on('data', (chunk) => {
        returnData += chunk;
      });

      response.on('end', () => {
        resolve(JSON.parse(returnData));
      });

      response.on('error', (error) => {
        reject(error);
      });
    });
    request.end();
  }));
}

module.exports = httpGet