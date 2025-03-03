FROM debian:bookworm-slim AS build

# Set non-interactive mode for apt
ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    cmake \
    libstdc++6 \
    libc6 \
    libboost-all-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /usr/src/app

COPY . .
RUN make
RUN strip --strip-unneeded bin/apm-krisp-nc


FROM debian:bookworm-slim

ENV OPENBLAS_NUM_THREADS=1

RUN apt-get update && apt-get install -y --no-install-recommends dumb-init && rm -rf /var/lib/apt/lists/*

WORKDIR /usr/local/bin

COPY --from=build /usr/src/app/bin/apm-krisp-nc .
COPY --from=build /usr/src/app/krisp/models ./krisp/models

RUN chmod +x /usr/local/bin/apm-krisp-nc

ENTRYPOINT ["/usr/bin/dumb-init", "--", "/usr/local/bin/apm-krisp-nc"]

EXPOSE 3344

CMD ["3344", "krisp/models/inb.bvc.hs.c6.w.s.23cdb3.kef"]
