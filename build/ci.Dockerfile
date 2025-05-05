FROM node:22-alpine AS build-ui
RUN apk add --no-cache npm git curl build-base python3

COPY ["new-lamassu-admin/package.json", "new-lamassu-admin/package-lock.json", "./"]

RUN npm version --allow-same-version --git-tag-version false --commit-hooks false 1.0.0
RUN npm install

COPY new-lamassu-admin/ ./
RUN npm run build

FROM ubuntu:20.04 as base

ARG VERSION
ARG DEBIAN_FRONTEND=noninteractive
ENV TZ=Europe/Lisbon

RUN apt-get update

RUN apt-get install -y -q curl \
                          sudo \
                          git \
                          python2-minimal \
                          build-essential \
                          libpq-dev \
                          net-tools \
                          tar

RUN curl -sL https://deb.nodesource.com/setup_14.x | sudo -E bash -
RUN apt-get install nodejs -y -q

WORKDIR lamassu-server

COPY ["package.json", "package-lock.json", "./"]
RUN npm version --allow-same-version --git-tag-version false --commit-hooks false 1.0.0
RUN npm install --production

COPY . ./
COPY --from=build-ui /build /lamassu-server/public

RUN cd .. && tar -zcvf lamassu-server.tar.gz ./lamassu-server
