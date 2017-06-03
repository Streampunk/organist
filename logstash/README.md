# logstash

logstash builds a container image based on the standard image from [elastic](https://www.elastic.co/guide/en/logstash/current/docker.html). The changes comprise uninstalling x-pack, installing the amazon-es plugin and enabling some specific configuration from environment variables.

## Configuration

There are three environment variables to control the relevant logstash plugins. They are: 
* AWS_ES_HOST - the AWS Elastic Search endpoint address to send data
* AWS_REGION - the AWS region name, defaults to 'eu-west-1'
* HTTP_LOG_PORT - the port number on which to listen for http log messages, defaults to 8765

Please see the credential parameters section of the [AWS ES Output Plugin](https://github.com/awslabs/logstash-output-amazon_es) for details of how to set up access to AWS ES.

## Status, support and further development

Contributions can be made via pull requests and will be considered by the author on their merits. Enhancement requests and bug reports should be raised as github issues. For support, please contact [Streampunk Media](http://www.streampunk.media/).

## License

This software is released under the Apache 2.0 license. Copyright 2017 Streampunk Media Ltd.
