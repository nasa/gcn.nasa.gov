---
handle:
  breadcrumb: Sample Code
---

# Sample Code

Here is a collection of functions and example code that may be useful
when working with GCN Notices. These include conversions from
text and VOEvent alert formats to JSON and XML (for VOEvent alerts), how to save alerts,
and some samples from the FAQs section of the [gcn-kafka-python](https://github.com/nasa-gcn/gcn-kafka-python) repository.

To contribute your own ideas, make a GitHub pull request to add it to [the Markdown source for this document](https://github.com/nasa-gcn/gcn.nasa.gov/blob/CodeSamples/app/routes/docs.client.samples.md), or [contact us](/contact).

## Parsing XML

Within your consumer loop, use the following functions to convert the
content of `message.value()` into other data types.

The `xmltodict` package is not part of the Python standard library. You must install it by running:
pip:

```sh
pip install xmltodict
```

```python
import email
import xml.etree.ElementTree as ET
import xmltodict

def parse_text_alert_to_dict(message_value):
    return dict(email.message_from_bytes(message_value))

def parse_voevent_alert_to_xml_root(message_value):
    return ET.fromstring(message_value)

def parse_voevent_alert_to_dict(message_value):
    return xmltodict.parse(message_value)
```

## Saving

Use the following to save the data to a local file:

```python
def save_alert(message):
    with open('path/to/your/file', 'wb') as file:
        file.write(message.value())

```

## Keep track of the last read message when restarting a client

Kafka can keep track of which messages your client has read, allowing your client to recover
missed messages after a restart by beginning at the earliest unread message
rather than the next available message from the stream.

To enable this feature, you will need to set a client Group ID using
the configuration dictionary argument for the Consumer and change
the auto offset reset option to the 'earliest' setting. Once this is done,
every new client with the given Group ID will begin reading the specified topic
at the earliest unread message.

When doing this, it is recommended to turn **off** the auto commit
feature because it can lose track of the last read message if the client
crashes before the auto commit interval (5 seconds by default) occurs.
Manually committing messages (i.e. storing the state of the last read message)
once they are read is the most robust method for tracking the last read
message.

```python
from gcn_kafka import Consumer

config = {'group.id': 'my group name',
          'auto.offset.reset': 'earliest',
          'enable.auto.commit': False}

consumer = Consumer(config=config,
                    client_id='fill me in',
                    client_secret='fill me in',
                    domain='gcn.nasa.gov')

topics = ['gcn.classic.voevent.FERMI_GBM_SUBTHRESH']
consumer.subscribe(topics)

while True:
    for message in consumer.consume(timeout=1):
        if message.error():
            print(message.error())
            continue
        print(message.value())
        consumer.commit(message)
```

## Read messages beginning at the earliest available messages for a given stream

To read a given topic stream from the earliest message that is
present in the stream buffer, set the Group ID to an empty string and
applying the 'earliest' setting for the auto offset reset option in the
configuration dictionary argument for the Consumer class.

This feature allows the user to scan for older messages for testing purposes or
to recover messages that may have been missed due to a crash or network outage.
Keep in mind that the stream buffers are finite in size. They currently hold
messages from the past few days.

```python
from gcn_kafka import Consumer

config = {'auto.offset.reset': 'earliest'}

consumer = Consumer(config=config,
                    client_id='fill me in',
                    client_secret='fill me in',
                    domain='gcn.nasa.gov')

topics = ['gcn.classic.voevent.INTEGRAL_SPIACS']
consumer.subscribe(topics)

while True:
    for message in consumer.consume(timeout=1):
        if message.error():
            print(message.error())
            continue
        print(message.value())

```

## Search for messages occurring within a given date range

To search for messages in a given date range, use the `offsets_for_times()`
method from the Consumer class to get the message offsets for the desired date range.
Then assign the starting offset to the Consumer and read the desired number of messages.
When doing so, keep in mind that the stream buffers are finite in size. It is not
possible to recover messages prior to the start of the stream buffer. The GCN stream
buffers are currently set to hold messages from the past few days.

```python
import datetime
from gcn_kafka import Consumer
from confluent_kafka import TopicPartition

consumer = Consumer(client_id='fill me in',
                    client_secret='fill me in',
                    domain='gcn.nasa.gov')

# get messages occurring 3 days ago
timestamp1 = int((datetime.datetime.now() - datetime.timedelta(days=3)).timestamp() * 1000)
timestamp2 = timestamp1 + 86400000 # +1 day

topic = 'gcn.classic.voevent.INTEGRAL_SPIACS'
start = consumer.offsets_for_times(
    [TopicPartition(topic, 0, timestamp1)])
end = consumer.offsets_for_times(
    [TopicPartition(topic, 0, timestamp2)])

consumer.assign(start)
for message in consumer.consume(end[0].offset - start[0].offset, timeout=1):
    if message.error():
            print(message.error())
            continue
    print(message.value())
```

## Parsing JSON

GCN Notices for new missions are typically distributed in JSON format. This guide explains how to programmatically read the JSON schema.

Start with subscribing to a Kafka topic and parsing the JSON data

```python
from gcn_kafka import Consumer
import json

# Connect as a Kafka consumer
consumer = Consumer(client_id='fill me in', # Replace with your client ID
    client_secret='fill me in',             # Replace with your client secret
    config={"message.max.bytes": 204194304},
)

# Subscribe to Kafka topic
consumer.subscribe(['igwn.gwalert'])

# Continuously consume and parse JSON data
for message in consumer.consume(timeout=1):
    if message.error():
        print(message.error())
        continue

    # Print the topic and message ID
    print(f"topic={message.topic()}, offset={message.offset()}")

    # Kafka message value as a Base64-encoded string
    value = message.value()
```

## Decoding Embedded Data

The following code demonstrates how to process a Kafka message containing a `base64` encoded skymap, decode it, and save it as a `.fits` file. Python's built-in [`base64`](https://docs.python.org/3/library/base64.html#base64.b64encode) module provides the `b64decode` method to make this task simple. JSON serialization uses Unicode, can handle a wide range of characters, enabling reliable handling of encoded data.

```python
import base64

# Convert the Kafka message value to a string
value_str = value.decode("utf-8")

# Parse the JSON data
value_json = json.loads(value_str)

# Extract the Base64-encoded skymap
skymap_string = value_json["event"]["skymap"]

# Decode the Base64 string
decoded_bytes = base64.b64decode(skymap_string)

# Save the decoded data as a FITS file
with open("skymap.fits", "wb") as fitsFile:
    fitsFile.write(decoded_bytes)
```

If you want to include a FITS file in a Notice, you add a property to your schema definition in the following format:

```python
{
    type: 'string',
    contentEncoding: 'base64',
    contentMediaType: 'image/fits',
}
```

## Encoding Embedded Data

For producer data production pipelines, the following encoding steps convert an input file to a bytestring. This guide demonstrates how to encode a file (e.g., skymap.fits) into a `base64` encoded string and submit it to the GCN Kafka broker.

```python
from gcn_kafka import Producer
import base64

# Set Kafka Topic and Producer Configuration
TOPIC = "igwn.gwalert"

producer = Producer(client_id='fill me in', # Replace with your client ID
    client_secret='fill me in',             # Replace with your client secret
    config={"message.max.bytes": 204194304},
)

data = {
    # ..
}

# Encode the file content in base64
with open("skymap.fits", "rb") as file:
    data["skymap"] = base64.b64encode(file.read())

# Convert the dictionary into bytes
data_string = str(data).encode()

producer.produce(
    TOPIC,
    data_string,
)

producer.flush()
```

See [non-JSON data](https://json-schema.org/understanding-json-schema/reference/non_json_data.html) for more information.
