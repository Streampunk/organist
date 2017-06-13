var http = require('http');
var fs = require('fs');
var Promise = require('bluebird');

var jobInput = fs.readFileSync(process.argv[2], 'utf8');
var jobJSON = JSON.parse(jobInput);

var contentInput = fs.readFileSync(process.argv[3], 'utf8');
var contentJSON = JSON.parse(contentInput);

var name = contentJSON.name;
var url = contentJSON.url;

jobJSON.nodes[1].file = url;
jobJSON.nodes[1].name = `Input ${name}`;
jobJSON.nodes[0].name = name;
jobJSON.nodes[2].name = `Convert ${name}`;
jobJSON.nodes[3].name = `Encode ${name}`;
jobJSON.nodes[4].name = `Monitor ${name}`;
jobJSON.nodes[5].name = `Write ${name}`;

console.log('Loading required features into Node-RED');

var loadModule = (modName) => new Promise((resolve, reject) => {
  var postData = `{"module": "${modName}"}`;
  var options = {
    hostname: 'lemarr',
    port: 1880,
    path: '/nodes',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData)
    }
  };
  var req = http.request(options, (res) => {
    console.log(`STATUS - ${modName}: ${res.statusCode}`);
    res.setEncoding('utf8');
    res.on('error', reject);
    res.on('data', (chunk) => {
      console.log(`BODY - ${modName}: ${chunk}`);
    });
    res.on('end', resolve);
  })
  req.on('error', reject);
  req.write(postData);
  req.end();
});

var flowID = null;

var postJob = () => new Promise((resolve, reject) => {
  var postData = JSON.stringify(jobJSON);
  var options = {
    hostname: 'lemarr',
    port: 1880,
    path: '/flow',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData)
    }
  };

  var req = http.request(options, (res) => {
    console.log(`STATUS - POST JOB: ${res.statusCode}`);
    console.log(`HEADERS - POST JOB: ${JSON.stringify(res.headers)}`);
    res.setEncoding('utf8');
    res.on('error', reject);
    res.on('data', (chunk) => {
      console.log(`BODY: ${chunk}`);
      var resJSON = JSON.parse(chunk);
      flowID = resJSON.id;
    });
    res.on('end', () => {
      console.log('No more data in response.');
      resolve();
    });
  });

  req.on('error', reject);

  // write data to request body
  req.write(postData);
  req.end();
});

var deleteJob = () => new Promise((resolve, reject) => {
  setTimeout(() => {
    var options = {
      hostname: 'lemarr',
      port: 1880,
      path: '/flow/' + flowID,
      method: 'DELETE'
    };

    var req = http.request(options, (res) => {
      console.log(`STATUS: ${res.statusCode}`);
      console.log(`HEADERS: ${JSON.stringify(res.headers)}`);
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        console.log(`BODY: ${chunk}`);
      });
      res.on('error', reject);
      res.on('end', () => {
        console.log('No more data in response.');
        resolve();
      });
    });

    req.on('error', reject);

    req.end();

  }, +process.argv[4] * 1000);
});

loadModule('node-red-contrib-dynamorse-core')
  .then(() => loadModule('node-red-contrib-dynamorse-ffmpeg'))
  .then(() => loadModule('node-red-contrib-dynamorse-rtp-io'))
  .then(() => loadModule('node-red-contrib-dynamorse-file-io'))
  .then(() => postJob())
  .then(() => deleteJob())
  .error(console.error);
