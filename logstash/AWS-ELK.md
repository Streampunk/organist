# ELK stack for redioactive

Instructions for using Node-RED with dynamorse to send logging to a logstash instance on AWS that is configured to be connected to an AWS ES instance.

## Amazon ES configuration
In order to be able to connect to Kibana, it is necessary to add your client's public IP address to the IP list that is authorised in the ES access policy. It can take about 30 minutes to finish processing once the list is updated.

## Dynamorse configuration
Dynamorse provides a global config node that provides an object that supports sending arbitrary log objects to logstash.
```Javascript
const logger = this.context().global.get('logger');

const msgObj = {
  class1: {
    key1: "one",
    key2: 2
  }
};

logger.send(msgObj);
```
Dynamorse logs NodeJS memory details every two seconds and funnel, valve and spout nodes send performance details every second. 

By default, the logging is disabled. To configure it, two environment variables must be set for the process that runs Node-RED - on Windows, for example, as follows:

```
set LOG_HOSTNAME=<public IP address/name of logstash instance>
set LOG_PORT=8765
```

## Kibana configuration
In the overview page of the ES instance, a Kibana URL is provided. This will bring up a Kibana page. Go to the Management tab (cog icon), select Saved Objects, select redioactive then View dashboard.