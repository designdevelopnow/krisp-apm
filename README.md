# Krisp APM Server

## Prerequisites

- cmake
- build-essential
- libboost-all-dev

## Installation

1. Clone the repository:
```bash
git clone git@github.com:designdevelopnow/krisp-apm.git
cd krisp-apm
```

2.Build
```bash
make
```

## Running the Server

```bash
export OPENBLAS_NUM_THREADS=1
./bin/apm-krisp-nc 3344 krisp/models/inb.bvc.hs.c6.w.s.23cdb3.kef 100.0 10 120
```
Here are the arguments:
1. Port number
2. Path to Krisp model
3. Noise Suppression Level
4. Max connections
5. Shutdown timeout for graceful shutdown. 

### Using Docker

1. Build and start using Docker Compose:
```bash
docker compose up --build
```

2. Stop the container:
```bash
docker compose down
```

### Testing
```bash
./test/nc-inb-server-test-driver.sh
```
### Clean an input slin16 wav file 
```bash
./test/nc-inb-server-test-driver.sh input.wav $PWD/output.wav
```
## Deploy using docker

### Build Image
```bash
docker compose build
docker save -o caretalk-krisp-apm-v1.tar caretalk/krisp-apm:v1
gzip caretalk-krisp-apm-v1.tar
```
### Copy image
```bash
scp caretalk-krisp-apm-v1.tar.gz user@remote_host:~/
```

### Load image
```
docker load -i caretalk-krisp-apm-v1.tar.gz
```

### Run
```bash
docker stop caretalk-krisp-apm
docker rm caretalk-krisp-apm
docker run -d \
  -p 3344:3344 \
  --name caretalk-krisp-apm \
  caretalk/krisp-apm:v1 3344 krisp/models/inb.bvc.hs.c6.w.s.23cdb3.kef 100.0 20 120
```