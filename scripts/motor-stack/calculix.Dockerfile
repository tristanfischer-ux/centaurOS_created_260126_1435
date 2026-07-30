FROM ubuntu:24.04@sha256:4fbb8e6a8395de5a7550b33509421a2bafbc0aab6c06ba2cef9ebffbc7092d90

ARG CALCULIX_VERSION=2.21-1

RUN apt-get update \
    && DEBIAN_FRONTEND=noninteractive apt-get install --no-install-recommends -y \
        "calculix-ccx=${CALCULIX_VERSION}" \
    && rm -rf /var/lib/apt/lists/*

ENTRYPOINT ["ccx"]
