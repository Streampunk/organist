# organist
Orchestrating the nodes and pulling out all the stops.

This project has two separate although related parts:

1. [Orchestrating dynamic software infrastructure using AWS step functions](./aws.md).
2. Some early examples of how an updated FIMS could be used to describe work carried out by streaming infrastructure (read on).

# New FIMS and NMOS

## Demonstration of building the JT-NM jigsaw

It all starts with the conceptual model from the [JT-NM Reference Architecture](file:///C:/users/sparkpunk/Google%20Drive/Streampunk%20Drive/tech/specs/jtnm/JT-NMReferenceArchitecturev1.0%20150904%20FINAL.pdf). The elements of this model can be broken down into:

* transport standards and file wrappers - grains;
* [NMOS](http://www.nmos.tv/) - flows, sources, senders, receivers, devices, nodes, registry;
* [FIMS](http://www.fims.tv/):
  * business services: capabilities, tasks, content & product management.
  * cross cutting services: continuous integration, measurement, monitoring and resource management.

An emerging vision of how to put the pieces of the jigsaw together.

## Dynamic software infrastructure

### Nodes on a single Node-RED instance

![basic platform](images/basic-platform1.png)

### Scale up in the same system

![scale up](images/scaleup.png)

### Scale out to many systems

![scale out](images/scaleout.png)

### Local context

![local context](images/local-context.png)

Each element in the global context can be the sender or receiver of one or more streams.

### Global context

![global context](images/global-context.png)

## Framework for services

The aim is to use the existing [FIMS](/fims-tv/fims) models as a template for a lightweight, micro-services style approach to setting up and tearing down virtual infrastructure to achieve specific jobs. In particular, the FIMS state model and job resource should be a basis for further development.

Example content item ... a [TV Clip](http://www.schema.org/TVClip).

```json
{
  "@context": "http://schema.org/",
  "@type": "TVClip",
  "name": "Streampunk Subculture",
  "file": "Streampunk Media Ltd",
  "fileFormat": "video/raw; width=1920; height=1080",
  "url": "Documents/media/examples/rtp-video-rfc4175-1080i50-sync.pcap",
  "dateCreated": "2016-09-10",
  "actor": {
    "type" : "Person",
    "name" : "Richard Cartwright",
    "jobTitle" : "Big Punk"
  }
}
```

In the demo, we run a javascript program from the command line that ....

1. Run up [dynamorse](/Streampunk/dynamorse) and [ledger](/Streampunk/ledger).
2. Receives the details of work to do, content to use and duration, e.g. run `node [index.js](./index.js) transform.json subculture.json 120`
3. Deploy infrastructure.
4. Runs a transcode process for two minutes.
5. Stops the transcode.

The job could be described as [actions](http://schema.org/docs/actions.html). For example:

```json
{
  "@context": "http://schema.org/",
  "@type": "Action",
  "name": "Live Transform",
  "description" : "Do a live transcode of a stream.",
  "instrument" : {
    "type" : "Thing",
    "name" : "dynamorse transform",
    "url" : "transform.json" },
  "target" : {
    "type" : "EntryPoint",
    "httpMethod" : "POST",
    "urlTemplate" : "http://localhost:8000",
    "contentType" : "application/json"
  },
  "location" : "Holiday Inn, RAI",
  "startTime" : "20160911T11:32:51Z",
  "endTime" : "20160911T11:34:51Z",
  "actionStatus" : { "type" : "PotentialActionStatus" , "name" : "Queued" },
  "object" : { "type" : "CreativeWork" },
  "result" : { "type" : "CreativeWork" }
}
```
