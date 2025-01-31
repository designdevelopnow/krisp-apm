# Caretalk APM using Krisp
## Overview

## Build Dependencies
The reference samples require
* **libsndfile** library to read and write WAV files
* Krisp SDK package with archive libraries for the noise canceling

The following environment variables are mandatory. The name of each parameter is self-explanatory.
* KRISP_SDK_PATH
* LIBSNDFILE_INC
* LIBSNDFILE_LIB

KRISP_SDK_PATH should point to the Krisp SDK package directory.

LIBSNDFILE_INC and LIBSNDFILE_LIB directories is required by the sample-nc app for the purpose of reading and writing WAV PCM-based audio files. It is not the SDK requirement.


### On Ubuntu
```apt install libsndfile1 libsndfile1-dev```


## Build Process

How to run the build


## NodeJS Module Dependencies
**Node** v20 or above. **NAPI** Version 9.
In addition to above depencies you will need the **npm**, and deps defined in the
src/sample-node/package.json.

The **NODE_INC** environement variable should be set to the include directory of the installed
**Node**.

On Ubuntu Linux with nvm it could be the ```$HOME/.nvm/versions/node/v22.9.0/include/node```
if installed locally.

## Build Node Module

### On Linux run
```make```


## Build Output
All apps will be stored inside the **bin** folder in the root directory



## Using cli


```node src/cli.js -i <PCM16 wav file> -o <output WAV file path> -m <path to the AI model> -n <noise suppression level 0-100>```

eg:

```node src/client/test-client.js data/audio/dog-bark.wav clean.wav


