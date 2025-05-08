# Krisp APM Server

Krisp APM Server is a high-performance C++ server for real-time noise suppression, powered by the Krisp AI SDK. Originally developed for Caretalk.ai. Designed for telephony and voice AI applications, it wraps Krisp’s model in a lightweight TCP server optimized for low latency and multi-connection handling.

---

## 🌟 Features

- Real-time SLIN16 audio noise cancellation
- Lightweight and multithreaded TCP server
- Docker-ready for deployment
- Includes CLI and test utilities
- Ideal for voice assistants, VoIP, and telephony pipelines

---

## 🔧 Prerequisites

Install the following dependencies:

- cmake
- build-essential
- libboost-all-dev

---

## 🚀 Installation

### 1. Clone the Repository

```
git clone git@github.com:designdevelopnow/krisp-apm.git
cd krisp-apm
```

### 2. Build the Project

```
make
```

---

## 🧪 Running the Server

```
export OPENBLAS_NUM_THREADS=1
./bin//apm-krisp-nc <PORT> <MODEL_PATH> <NS_LEVEL> <MAX_CONNECTIONS> <SHUTDOWN_TIMEOUT>
```

**Arguments:**
- <PORT>: Port to listen on (e.g. 3344)
- <MODEL_PATH>: Path to .kef Krisp model file
- <NS_LEVEL>: Noise suppression level (e.g. 100.0)
- <MAX_CONNECTIONS>: Maximum simultaneous connections
- <SHUTDOWN_TIMEOUT>: Graceful shutdown timeout in seconds

---

## 🐳 Docker Usage

### Build and Run

```
docker compose up --build
```

### Stop

```
docker compose down
```

---

## 🔁 Testing

### Run Test Driver

```
./test/nc-inb-server-test-driver.sh
```

### Clean a SLIN16 .wav File

```
./test/nc-inb-server-test-driver.sh input.wav ./output.wav
```

---

## 📦 Deployment with Docker

### Build Docker Image

```
docker compose build
```


### Run the Container

```
docker run -d \
-p 3344:3344 \
--name krisp-apm \
krisp-apm:v1 3344 krisp/models/inb.bvc.hs.c6.w.s.23cdb3.kef 100.0 20 120
```

---

## 🙌 Contributing

We welcome contributions!

- Report bugs and request features via GitHub Issues

---

## 📄 License

This project is licensed under the MIT License. This repo does not include Krisp’s proprietary model files. You must obtain a valid Krisp SDK license to use this software.

---

## 📫 Contact

Have questions or suggestions? Please open an issue or start a discussion on GitHub.
