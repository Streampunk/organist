var http = require('http');
var fs = require('fs');

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

var postData = JSON.stringify(jobJSON);
var flowID = null;

var options = {
  hostname: 'localhost',
  port: 8000,
  path: '/RED/flow',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(postData)
  }
};

var req = http.request(options, (res) => {
  console.log(`STATUS: ${res.statusCode}`);
  console.log(`HEADERS: ${JSON.stringify(res.headers)}`);
  res.setEncoding('utf8');
  res.on('data', (chunk) => {
    console.log(`BODY: ${chunk}`);
    var resJSON = JSON.parse(chunk);
    flowID = resJSON.id;
  });
  res.on('end', () => {
    console.log('No more data in response.');
  });
});

req.on('error', (e) => {
  console.log(`problem with request: ${e.message}`);
});

// write data to request body
req.write(postData);
req.end();

setTimeout(function() {
  var options = {
    hostname: 'localhost',
    port: 8000,
    path: '/RED/flow/' + flowID,
    method: 'DELETE'
  };

  var req = http.request(options, (res) => {
    console.log(`STATUS: ${res.statusCode}`);
    console.log(`HEADERS: ${JSON.stringify(res.headers)}`);
    res.setEncoding('utf8');
    res.on('data', (chunk) => {
      console.log(`BODY: ${chunk}`);
    });
    res.on('end', () => {
      console.log('No more data in response.');
      console.log('Create new content item that links to previous item.')
    });
  });

  req.on('error', (e) => {
    console.log(`problem with request: ${e.message}`);
  });

  req.end();

}, +process.argv[4] * 1000);
