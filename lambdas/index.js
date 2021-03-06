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
var fs = require('fs');
var uuid = require('uuid');

var awsRegion = "eu-west-1";

// Configuring the AWS SDK
// Credentials from file ~/.aws/credentials - http://docs.aws.amazon.com/sdk-for-javascript/v2/developer-guide/loading-node-credentials-shared.html
var AWS = require('aws-sdk');
AWS.config.update({region: awsRegion});

// Create EC2 service interface object
var ec2 = new AWS.EC2({apiVersion: '2016-11-15'});

// Create ECS service interface object
var ecs = new AWS.ECS({apiVersion: '2014-11-13'});

function waitCountClusterInstances(clusterName) {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      ecs.describeClusters({ clusters: [ clusterName ] }).promise()
      .then ((data) => resolve(data.clusters[0].registeredContainerInstancesCount))
      .catch ((err) => reject(err));
    }, 1000);
  });
}

function adminApiReq(method, host, port, path, payload) {
  return new Promise((resolve, reject) => {
    var req = http.request({
      host: host,
      port : port,
      path : path,
      method : method,
      timeout : 180000,
      headers : {
        'Content-Type' : 'application/json',
        'Content-Length' : payload.length
      }
    }, (res) => {
      var statusCode = res.statusCode;
      var contentType = res.headers['content-type'];

      if (!((200 === statusCode) || (204 == statusCode)))
        reject(new Error(`http '${method}' request to path '${host}${path}' failed with status ${statusCode}`));

      res.setEncoding('utf8');
      var rawData = "";
      res.on('data', (chunk) => rawData += chunk);
      res.on('end', () => {
        resolve(JSON.parse(rawData));
      });
    }).on("error", (e) => {
      reject(new Error(`problem with admin API '${method}' request to path '${host}${path}': ${e.message}`));
    });

    req.write(payload);
    req.end();
  });
}

function readJSON(file) {
  return new Promise((resolve, reject) => {
    fs.readFile(file, { encoding: 'utf8' }, (err, result) => {
      if (err) return reject(err);
      try {
        resolve(JSON.parse(result.toString()));
      } catch (se) {
        reject(se);
      }
    });
  });
}

exports.showInstances = function(event, context, callback) {
  console.log('Received event: ', JSON.stringify(event, null, 2));
  console.log('Received context: ', JSON.stringify(context, null, 2));

  let instanceName = event.instanceName || "NodeRedInstance";

  console.log(`Showing instances with name '${instanceName}'...`);

  ec2.describeInstances({
    Filters: [{
      Name: "tag:Name",
      Values: [
        instanceName
      ]
    }]
  }).promise()
  .then (data => {
    console.log(JSON.stringify(data, null, 2));
    callback(null, data);
  })
  .catch(err => {
    console.error(err);
    callback(err);
  });
};

exports.newInstance = function(event, context, callback) {
  console.log('Received event: ', JSON.stringify(event, null, 2));
  console.log('Received context: ', JSON.stringify(context, null, 2));

  let uniqueId = uuid.v4();
  let instanceName = `${event.instanceName || "NodeRedInstance"}-${uniqueId}`;
  let instanceType = event.instanceType || "t2.micro";
  let clusterName = `${instanceName}-cluster`;

  let securityGroupName = "Node-RED security group";

  console.log(`Starting '${instanceType}' instance '${instanceName}' in cluster '${clusterName}'...`);

  ecs.createCluster({
    clusterName: clusterName
  }).promise()
  .then (data => {
    return ec2.describeImages({
      Filters: [{
        Name: "name",
        Values: [
          "amzn-ami-2016.09.g-amazon-ecs-optimized"
        ]
      }]
    }).promise();
  })
  .then (data => {
    return ec2.runInstances({
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
    }).promise();
  })
  .then (data => {
    return ec2.waitFor("instanceRunning", {
      InstanceIds: [ data.Instances[0].InstanceId ]
    }).promise();
  })
  .then (data => {
    let curCount = 0;
    let chain = Promise.resolve(curCount);

    const maxWaitSeconds = 60;
    let numSeconds = 0;
    for (let i=0; i<maxWaitSeconds; ++i) {
      chain = chain.then((count) => {
        if (count > curCount)
          console.log(`Found new container instance after ${numSeconds} seconds`);
        curCount = count;

        numSeconds++;
        if (maxWaitSeconds === numSeconds)
          return ecs.describeClusters({ clusters: [ clusterName ] }).promise();
        else if (curCount > 0)
          return Promise.resolve(curCount);
        else
          return waitCountClusterInstances(clusterName);
      });
    }
    return chain;
  })
  .then (data => {
    if (0 === data.clusters[0].registeredContainerInstancesCount)
      return Promise.reject(new Error(`Cluster ${clusterName} has no container instances`));

    return ec2.describeInstances({
      Filters: [{
        Name: "tag:Name",
        Values: [
          instanceName
        ]
      }]
    }).promise();
  })
  .then (data => {
    console.log(`Instance '${instanceName}' in cluster '${clusterName}' has been started`);
    console.log(JSON.stringify(data, null, 2));
    callback(null, instanceName);
  })
  .catch(err => {
    console.error(err);
    callback(err);
  });
};

exports.terminateInstance = function(event, context, callback) {
  console.log('Received event: ', JSON.stringify(event, null, 2));
  console.log('Received context: ', JSON.stringify(context, null, 2));

  let instanceName = event.instanceName || "NodeRedInstance";
  let clusterName = `${instanceName}-cluster`;

  console.log(`Terminating instance '${instanceName}'...`);

  ec2.describeInstances({
    Filters: [{
      Name: "tag:Name",
      Values: [
        instanceName
      ]
    }]
  }).promise()
  .then (data => {
    if (0 === data.Reservations.length)
      return Promise.reject(new Error(`Instance ${instanceName} not found`));

    return ec2.terminateInstances({
      InstanceIds: [
        data.Reservations[0].Instances[0].InstanceId
      ]
    }).promise();
  })
  .then (data => {
    return ec2.waitFor("instanceTerminated", {
      InstanceIds: [ data.TerminatingInstances[0].InstanceId ]
    }).promise();
  })
  .then (data => {
    console.log(`Instance '${instanceName}' has been terminated`);
    console.log(JSON.stringify(data, null, 2));
  })
  .then (data => {
    return ecs.deleteCluster({
      cluster: clusterName
    }).promise();
  })
  .then (data => {
    console.log(`Cluster '${clusterName}' has been deleted`);
    callback(null, data);
  })
  .catch(err => {
    console.error(err);
    callback(err);
  });
};

exports.startNodeRED = function(event, context, callback) {
  console.log('Received event: ', JSON.stringify(event, null, 2));
  console.log('Received context: ', JSON.stringify(context, null, 2));

  let instanceName = event.instanceName || "NodeRedInstance";
  let clusterName = `${instanceName}-cluster`;
  let taskFamilyName = "Node-RED-Family";

  ecs.runTask({
    cluster: clusterName,
    taskDefinition: taskFamilyName,
    count: 1,
    placementConstraints: [{
      type: "distinctInstance"
    }]
  }).promise()
  .then (data => {
    console.log("Run task promise completes: ", JSON.stringify(data, null, 2));
    return ecs.waitFor("tasksRunning", {
      cluster: data.tasks[0].clusterArn,
      tasks: [
        data.tasks[0].containers[0].taskArn
      ]
    }).promise();
  })
  .then (data => {
    console.log("After tasksRunning received:", JSON.stringify(data, null, 2));
    callback(null, data);
  })
  .catch(err => {
    console.error("Error in startNodeRED: ", err);
    callback(err);
  });
};

exports.installNodeREDModule = function(event, context, callback) {
  console.log('Received event: ', JSON.stringify(event, null, 2));
  console.log('Received context: ', JSON.stringify(context, null, 2));

  let instanceName = event.instanceName || "NodeRedInstance";
  let moduleName = event.moduleName || "node-red-contrib-dynamorse-core";

  ec2.describeInstances({
    Filters: [{
      Name: "tag:Name",
      Values: [
        instanceName
      ]
    }]
  }).promise()
  .then (data => {
    if (0 === data.Reservations.length)
      return Promise.reject(new Error(`Instance ${instanceName} not found`, null));

    let host = data.Reservations[0].Instances[0].PublicIpAddress;
    return adminApiReq('POST', host, 1880, '/nodes', JSON.stringify({ "module": moduleName }));
  })
  .then (data => {
    console.log(JSON.stringify(data, null, 2));
    callback(null, data);
  })
  .catch(err => {
    console.error(err);
    callback(err);
  });
};

exports.deployFlow = function(event, context, callback) {
  console.log('Received event: ', JSON.stringify(event, null, 2));
  console.log('Received context: ', JSON.stringify(context, null, 2));

  let instanceName = event.instanceName || "NodeRedInstance";
  let flow = event.flow;

  ec2.describeInstances({
    Filters: [{
      Name: "tag:Name",
      Values: [
        instanceName
      ]
    }]
  }).promise()
  .then (data => {
    if (0 === data.Reservations.length)
      return Promise.reject(new Error(`Instance ${instanceName} not found`));

    let host = data.Reservations[0].Instances[0].PublicIpAddress;
    return adminApiReq('POST', host, 1880, '/flow', JSON.stringify(flow));
  })
  .then (data => {
    console.log(JSON.stringify(data, null, 2));
    callback(null, data);
  })
  .catch(err => {
    console.error(err);
    callback(err);
  });
};

exports.makeAMix = function(event, context, callback) {
  console.log('Received event: ', JSON.stringify(event, null, 2));
  console.log('Received context: ', JSON.stringify(context, null, 2));

  readJSON('flows/cloud1.json').then(x => {
    event[0].mixParams.flow = x;
    console.log('Output mixer config flow: ', JSON.stringify(event[0].mixParams));
    callback(null, event);
  })
  .catch(err => {
    console.error(err);
    callback(err);
  });
};

exports.makeAnEncode = function(event, context, callback) {
  console.log('Received event: ', JSON.stringify(event, null, 2));
  console.log('Received context: ', JSON.stringify(context, null, 2));

  let instanceName = event[0].mixParams.instanceName || "NodeRedInstance";
  let cloud1DNS = '';

  ec2.describeInstances({
    Filters: [{
      Name: "tag:Name",
      Values: [
        instanceName
      ]
    }]
  }).promise()
  .then (x => {
    if (0 === x.Reservations.length)
      return Promise.reject(new Error(`Instance ${instanceName} not found`));

    cloud1DNS = x.Reservations[0].Instances[0].PrivateDnsName;
    return readJSON('flows/cloud2.json');
  })
  .then(x => {
    x.nodes[0].pullURL = 'https://' + cloud1DNS;
    event[1].encodeParams.flow = x;
    console.log('Output encoder config flow: ', JSON.stringify(event[1].encodeParams));
    callback(null, event);
  })
  .catch(err => {
    console.error(err);
    callback(err);
  });
};

exports.makeModuleParams = function(event, context, callback) {
  console.log('Received event: ', JSON.stringify(event, null, 2));
  console.log('Received context: ', JSON.stringify(context, null, 2));

  let moduleParams = {};
  for (let module in event.modules) {
    let nrcName = `node-red-contrib-dynamorse-${event.modules[module]}`;
    let params = JSON.parse(`{ "${event.modules[module]}": { "instanceName": "${event.instanceName}", "moduleName": "${nrcName}" }}`); 
    moduleParams = Object.assign (moduleParams, params);
  }

  callback(null, moduleParams);
};
