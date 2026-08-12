# payNEXT

payNEXT is a digital wallet platform.

## Local Development

The frontend is served using Docker and Nginx.

## Deploy

This project uses GitHub Actions to deploy to the server.

When changes are pushed to the `main` branch, GitHub Actions will:

1. Copy files to the server
2. Build the Docker image
3. Restart the payNEXT web container

## Server

```text
http://104.214.170.158
```
