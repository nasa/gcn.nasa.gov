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

- [Working with Kafka messages](#parsing)

- [HEALPix Sky Maps](#healpix-sky-maps)

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

GCN Notices are distributed through Kafka topics and, for new missions, are typically provided in JSON format. This guide explains how to programmatically read the JSON schema.

Start by subscribing to a Kafka topic and parsing the JSON data.

```python
from gcn_kafka import Consumer
import json

# Kafka consumer configuration
consumer = Consumer(
    client_id='fill me in',
    client_secret='fill me in',
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

    # Decode message value
    value = message.value()
    value_str = value.decode("utf-8")
    alert_json = json.loads(value_str)
```

## Decoding Embedded Data

Some GCN notices include HEALPix sky maps encoded in `base64`.
The following code demonstrates how to extract, decode, and save the HEALPix data as a `.fits` file from a received notice. Python's built-in [`base64`](https://docs.python.org/3/library/base64.html#base64.b64encode) module provides the `b64decode` method to simplify the decoding process.

```python
import base64
from astropy.io import fits

# Extract the base64-encoded skymap
skymap_string = alert_json["event"]["skymap"]

# Decode the Base64 string to bytes
decoded_bytes = base64.b64decode(skymap_string)

# Write bytes to a FITS file
with open("skymap.fits", "wb") as fits_file:
    fits_file.write(decoded_bytes)

# Open and inspect the FITS file
with fits.open("skymap.fits") as hdul:
    hdul.info()
```

## JSON Schema Example for Embedding a FITS File

If you want to include a FITS file in a Notice, add a property to your schema definition in the following format:

```json
"healpix_file": {
    "type": "string",
    "contentEncoding": "base64",
    "contentMediaType": "image/fits",
    "description": "Base 64 encoded content of a FITS file"
}
```

JSON Schema supports embedding non-JSON media within strings using the `contentMediaType` and `contentEncoding`, which enable the distribution of diverse data types. For further details, refer to [non-JSON data](https://json-schema.org/understanding-json-schema/reference/non_json_data.html).

## Encoding Embedded Data

For producer data production pipelines, the following encoding steps convert an input file to a byte string. This guide demonstrates how to encode a file (e.g., skymap.fits) into a `base64` encoded string and submit it to the GCN Kafka broker.

```python
from gcn_kafka import Producer
import base64
import json

# Kafka Producer Configuration
producer = Producer(client_id='fill me in',
	client_secret='fill me in',
	config={"message.max.bytes": 204194304},

# Set Kafka Topic and Producer Configuration
TOPIC = "igwn.gwalert"

data = {
    "event": {}
}

# Read and encode the FITS file
with open("skymap.fits", "rb") as file:
	data["event"]["skymap"] = base64.b64encode(file.read())

# Convert dictionary to JSON
json_data = json.dumps(data).encode("utf-8")

# Publish the message
producer.produce(
	TOPIC,
	json_data,
)

producer.flush()
```

## HEALPix Sky Maps

[HEALPix](https://healpix.sourceforge.io) (<b>H</b>ierarchical, <b>E</b>qual <b>A</b>rea, and iso-<b>L</b>atitude <b>Pix</b>elisation) is a scheme for indexing positions on the unit sphere.
For localization of events, the multi-messenger community uses the standard HEALPix [@2005ApJ...622..759G] with the file extension `.fits.gz`, as well as multi-resolution HEALPix [@2015A&A...578A.114F] with the file extension `.multiorder.fits`. The preferred format is the multi-resolution HEALPix format.

### Multi-Order Sky Maps

GCN strongly encourages the use of multi-order sky maps. They utilize a variable resolution, with higher probability regions having higher resolution and lower probability regions being encoded with a lower resolution. Variable resolution allows multi-order sky maps to be significantly more efficient than single-resolution HEALPix sky maps with respect to both storage footprint and read speed.

#### Reading Sky Maps

Sky maps can be parsed using Python and a small number of packages. While this documentation covers the use of `astropy-healpix`, there are several packages that can be used for this purpose; a number of [alternatives](#other-documentation-and-healpix-packages) are listed at the bottom of this page.

```python
import astropy_healpix as ah
import numpy as np

from astropy import units as u
from astropy.table import QTable
```

A given sky map can then be read in as:

```python
skymap = QTable.read('skymap.multiorder.fits')
```

#### Most Probable Sky Location

Let's calculate the index of the sky point with the highest probability density, as follows:

```python
hp_index = np.argmax(skymap['PROBDENSITY'])
uniq = skymap[hp_index]['UNIQ']

level, ipix = ah.uniq_to_level_ipix(uniq)
nside = ah.level_to_nside(level)

ra, dec = ah.healpix_to_lonlat(ipix, nside, order='nested')
```

#### Probability Density at a Known Position

Similarly, one can calculate the probability density at a known position:

```python
ra, dec = 197.450341598 * u.deg, -23.3814675445 * u.deg

level, ipix = ah.uniq_to_level_ipix(skymap['UNIQ'])
nside = ah.level_to_nside(level)

match_ipix = ah.lonlat_to_healpix(ra, dec, nside, order='nested')

match_index = np.flatnonzero(ipix == match_ipix)[0]

prob_density = skymap[match_index]['PROBDENSITY'].to_value(u.deg**-2)
```

#### 90% Probability Region

The estimation of a 90% probability region involves sorting the pixels, calculating the area of each pixel, and then summing the probability of each pixel until 90% is reached.

```python
#Sort the pixels by decending probability density
skymap.sort('PROBDENSITY', reverse=True)

#Area of each pixel
level, ipix = ah.uniq_to_level_ipix(skymap['UNIQ'])
pixel_area = ah.nside_to_pixel_area(ah.level_to_nside(level))

#Pixel area times the probability
prob = pixel_area * skymap['PROBDENSITY']

#Cummulative sum of probability
cumprob = np.cumsum(prob)

#Pixels for which cummulative is 0.9
i = cumprob.searchsorted(0.9)

#Sum of the areas of the pixels up to that one
area_90 = pixel_area[:i].sum()
area_90.to_value(u.deg**2)
```

### Flat Resolution HEALPix Sky maps

A sky map `.fits.gz` file can be read in using `healpy`:

```python
import healpy as hp
import numpy as np
from matplotlib import pyplot as plt

# Read both the HEALPix image data and the FITS header
hpx, header = hp.read_map('skymap.fits.gz', h=True)

# Plot a Mollweide-projection all-sky image
np.mollview(hpx)
plt.show()
```

#### Most Probable Sky Location

The point on the sky with the highest probability can be found by finding the maximum value in the HEALPix sky map:

```python
# Reading Sky Maps with Healpy
healpix_image = hp.read_map('bayestar.fits.gz,0')
npix = len(hpx)

# Lateral resolution of the HEALPix map
nside = hp.npix2nside(npix)

# Find the highest probability pixel
ipix_max = np.argmax(hpx)

# Probability density per square degree at that position
hpx[ipix_max] / hp.nside2pixarea(nside, degrees=True)

# Highest probability pixel on the sky
ra, dec = hp.pix2ang(nside, ipix_max, lonlat=True)
ra, dec
```

#### Integrated probability in a Circle

We can calculate the integrated probability within an arbitrary circle on the sky:

```python
# First define the Cartesian coordinates of the center of the circle
ra = 180.0
dec = -45.0
radius = 2.5

# Calculate Cartesian coordinates of the center of the Circle
xyz = hp.ang2vec(ra, dec, lonlat=True)

# Obtain an array of indices for the pixels inside the circle
ipix_disc = hp.query_disc(nside, xyz, np.deg2rad(radius))

# Sum the probability in all of the matching pixels:
hpx[ipix_disc].sum()
```

#### Integrated probability in a Polygon

Similar to the integrated probability within a circle, it is possible to calculate the integrated probability of the source lying within an arbitrary polygon:

```python
#  Indices of the pixels within a polygon (defined by the Cartesian coordinates of its vertices)

xyz = [[0, 0, 0],
       [1, 0, 0],
       [1, 1, 0],
       [0, 1, 0]]
ipix_poly = hp.query_polygon(nside, xyz)
hpx[ipix_poly].sum()
```

#### Other Documentation and HEALPix Packages

For more information and resources on the analysis of pixelated data on a sphere, explore the following links:

- Additional information can be found on the [LIGO website](https://emfollow.docs.ligo.org/userguide/tutorial/multiorder_skymaps.html)

- [healpy](https://healpy.readthedocs.io/en/latest/): Official Python library for handling the pixelated data on sphere

- [astropy-healpix](https://pypi.org/project/astropy-healpix/): Integrates HEALPix with Astropy for data manipulation and analysis

- [mhealpy](https://mhealpy.readthedocs.io/en/latest/): Object-oriented wrapper of healpy for handling the multi-resolution maps

- [MOCpy](https://cds-astro.github.io/mocpy/): Python library allowing easy creation, parsing and manipulation of Multi-Order Coverage maps.

## Bibilography
