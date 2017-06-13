/* Copyright 2017 Streampunk Media Ltd.

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  See the License for the specific language governing permissions and
  limitations under the License.
*/

'use strict';

var http = require('http');

var awsRegion = "eu-west-1"

// Configuring the AWS SDK
// Credentials from file ~/.aws/credentials - http://docs.aws.amazon.com/sdk-for-javascript/v2/developer-guide/loading-node-credentials-shared.html
var AWS = require('aws-sdk');
AWS.config.update({region: awsRegion});

// Create EC2 service interface object
var ec2 = new AWS.EC2({apiVersion: '2016-11-15'});

// Create ECS service interface object
var ecs = new AWS.ECS({apiVersion: '2014-11-13'});

function createCluster(params) {
  return new Promise((resolve, reject) => {
    ecs.createCluster(params, (err, data) => {
      if (err) reject(err);
      else resolve(data);
    });
  });
}

function deleteCluster(params) {
  return new Promise((resolve, reject) => {
    ecs.deleteCluster(params, (err, data) => {
      if (err) reject(err);
      else resolve(data);
    });
  });
}

function describeInstances(params) {
  return new Promise((resolve, reject) => {
    ec2.describeInstances(params, (err, data) => {
      if (err) reject(err);
      else resolve(data);
    });
  });
}

function describeImages(params) {
  return new Promise((resolve, reject) => {
    ec2.describeImages(params, (err, data) => {
      if (err) reject(err);
      else resolve(data);
    });
  });
}

function runInstances(params) {
  return new Promise((resolve, reject) => {
    ec2.runInstances(params, (err, data) => {
      if (err) reject(err);
      else resolve(data);
    });
  });
}

function waitForEC2(state, params) {
  return new Promise((resolve, reject) => {
    ec2.waitFor(state, params, (err, data) => {
      if (err) reject(err);
      else resolve(data);
    });
  });
}

function terminateInstances(params) {
  return new Promise((resolve, reject) => {
    ec2.terminateInstances(params, (err, data) => {
      if (err) reject(err);
      else resolve(data);
    });
  });
}

function runTask(params) {
  return new Promise((resolve, reject) => {
    ecs.runTask(params, (err, data) => {
      if (err) reject(err);
      else resolve(data);
    });
  });
}

function waitForECS(state, params) {
  return new Promise((resolve, reject) => {
    ecs.waitFor(state, params, (err, data) => {
      if (err) reject(err);
      else resolve(data);
    });
  });
}

function adminApiReq(method, host, port, path, payload) {
  return new Promise((resolve, reject) => {
    var req = http.request({
      host: host,
      port : port,
      path : path,
      method : method,
      headers : {
        'Content-Type' : 'application/json',
        'Content-Length' : payload.length
      }
    }, (res) => {
      var statusCode = res.statusCode;
      var contentType = res.headers['content-type'];

      if (!((200 === statusCode) || (204 == statusCode)))
        reject(`http '${method}' request to path '${host}${path}' failed with status ${statusCode}`);

      res.setEncoding('utf8');
      var rawData = "";
      res.on('data', (chunk) => rawData += chunk);
      res.on('end', () => {
        resolve(JSON.parse(rawData));
      })
    }).on("error", (e) => {
      reject(`problem with admin API '${method}' request to path '${host}${path}': ${e.message}`);
    });

    req.write(payload);
    req.end();
  });
}

exports.showInstances = function(event, context, callback) {
  console.log('Received event: ', JSON.stringify(event, null, 2));
  console.log('Received context: ', JSON.stringify(context, null, 2));

  let instanceName = event.instanceName || "NodeRedInstance";

  console.log(`Showing instances with name '${instanceName}'...`);

  describeInstances({
    Filters: [{
      Name: "tag:Name",
      Values: [
        instanceName
      ]
    }]
  })
  .then (data => {
    console.log(JSON.stringify(data, null, 2));
    callback(null, data);
  })
  .catch(err => {
    console.error(err);
    callback(err, null);
  });
}

exports.newInstance = function(event, context, callback) {
  console.log('Received event: ', JSON.stringify(event, null, 2));
  console.log('Received context: ', JSON.stringify(context, null, 2));

  let instanceName = event.instanceName || "NodeRedInstance";
  let instanceType = event.instanceType || "t2.micro";
  let clusterName = `${instanceName}-cluster`;

  let securityGroupName = "Node-RED security group";

  console.log(`Starting '${instanceType}' instance '${instanceName}' in cluster '${clusterName}'...`);

  createCluster({
    clusterName: clusterName 
  })
  .then (data => {
    return describeImages ({
      Filters: [{
        Name: "name",
        Values: [
          "amzn-ami-2016.09.g-amazon-ecs-optimized"
        ]
      }]
    });
  })
  .then (data => {
    return runInstances ({
      ImageId: data.Images[0].ImageId,
      InstanceType: instanceType,
      Monitoring: {
        Enabled: true
      },
      MinCount: 1,
      MaxCount: 1,
      IamInstanceProfile: {
        Name: "ecsInstanceRole"
      },
      TagSpecifications: [{
        ResourceType: "instance",
        Tags: [{
          Key: "Name",
          Value: instanceName
        }]
      }],
      SecurityGroups: [
        securityGroupName
      ],
      UserData: Buffer.from(`#!/bin/bash\n echo ECS_CLUSTER=${clusterName} >> /etc/ecs/ecs.config`).toString('base64')
    });
  })
  .then (data => {
    return waitForEC2("instanceRunning", {
      InstanceIds: [ data.Instances[0].InstanceId ]
    })
  })
  .then (data => {
    return describeInstances ({
      Filters: [{
        Name: "tag:Name",
        Values: [
          instanceName
        ]
      }]
    });
  })
  .then (data => {
    console.log(`Instance '${instanceName}' in cluster '${clusterName}' has been started`);
    console.log(JSON.stringify(data, null, 2));
    callback(null, data);
  })
  .catch(err => {
    console.error(err);
    callback(err, null);
  });
}

exports.terminateInstance = function(event, context, callback) {
  console.log('Received event: ', JSON.stringify(event, null, 2));
  console.log('Received context: ', JSON.stringify(context, null, 2));

  let instanceName = event.instanceName || "NodeRedInstance";
  let clusterName = `${instanceName}-cluster`;

  console.log(`Terminating instance '${instanceName}'...`);

  describeInstances ({
    Filters: [{
      Name: "tag:Name",
      Values: [
        instanceName
      ]
    }]
  })
  .then (data => {
    if (0 === data.Reservations.length) {
      callback (`Instance ${instanceName} not found`, null);
      return;
    }
    return terminateInstances ({
      InstanceIds: [
        data.Reservations[0].Instances[0].InstanceId
      ]
    });
  })
  .then (data => {
    return waitForEC2("instanceTerminated", {
      InstanceIds: [ data.TerminatingInstances[0].InstanceId ]
    })
  })
  .then (data => {
    console.log(`Instance '${instanceName}' has been terminated`);
    console.log(JSON.stringify(data, null, 2));
  })
  .then (data => {
    return deleteCluster ({
      cluster: clusterName
    })
  })
  .then (data => {
    console.log(`Cluster '${clusterName}' has been deleted`);
    callback(null, data);
  })
  .catch(err => {
    console.error(err);
    callback(err, null);
  });
}

exports.startNodeRED = function(event, context, callback) {
  console.log('Received event: ', JSON.stringify(event, null, 2));
  console.log('Received context: ', JSON.stringify(context, null, 2));

  let instanceName = event.instanceName || "NodeRedInstance";
  let clusterName = `${instanceName}-cluster`;
  let taskFamilyName = "Node-RED-Family";

  runTask({
    cluster: clusterName, 
    taskDefinition: taskFamilyName,
    count: 1,
    placementConstraints: [{
      type: "distinctInstance"
    }]
  })
  .then (data => {
    return waitForECS("tasksRunning", {
      cluster: data.tasks[0].clusterArn,
      tasks: [
        data.tasks[0].containers[0].taskArn
      ]
    });
  })
  .then (data => {
    console.log(JSON.stringify(data, null, 2));
    callback(null, data);
  })
  .catch(err => {
    console.error(err);
    callback(err, null);
  });
}

exports.installNodeREDModule = function(event, context, callback) {
  console.log('Received event: ', JSON.stringify(event, null, 2));
  console.log('Received context: ', JSON.stringify(context, null, 2));

  let instanceName = event.instanceName || "NodeRedInstance";
  let moduleName = event.moduleName || "node-red-contrib-dynamorse-core";

  describeInstances ({
    Filters: [{
      Name: "tag:Name",
      Values: [
        instanceName
      ]
    }]
  })
  .then (data => {
    if (0 === data.Reservations.length) {
      callback (`Instance ${instanceName} not found`, null);
      return;
    }
    let host = data.Reservations[0].Instances[0].PublicIpAddress;
    return adminApiReq('POST', host, 1880, '/nodes', JSON.stringify({ "module": moduleName }));
  })
  .then (data => {
    console.log(JSON.stringify(data, null, 2));
    callback(null, data);
  })
  .catch(err => {
    console.error(err);
    callback(err, null);
  });
}

exports.deployFlow = function(event, context, callback) {
  console.log('Received event: ', JSON.stringify(event, null, 2));
  console.log('Received context: ', JSON.stringify(context, null, 2));

  let instanceName = event.instanceName || "NodeRedInstance";
  let flow = event.flow;

  describeInstances ({
    Filters: [{
      Name: "tag:Name",
      Values: [
        instanceName
      ]
    }]
  })
  .then (data => {
    if (0 === data.Reservations.length) {
      callback (`Instance ${instanceName} not found`, null);
      return;
    }
    let host = data.Reservations[0].Instances[0].PublicIpAddress;
    return adminApiReq('POST', host, 1880, '/flow', JSON.stringify(flow));
  })
  .then (data => {
    console.log(JSON.stringify(data, null, 2));
    callback(null, data);
  })
  .catch(err => {
    console.error(err);
    callback(err, null);
  });
}
