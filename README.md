# aws-ses-v2-local-docker

Run [aws-ses-v2-local](https://github.com/domdomegg/aws-ses-v2-local), a local
emulator for Amazon SES, in a Docker container. This repository only packages
the upstream npm package; the emulator itself is maintained upstream.

Available from Docker Hub: [pensk/aws-ses-v2-local](https://hub.docker.com/r/pensk/aws-ses-v2-local)

Images built from this Dockerfile contain aws-ses-v2-local **2.11.0** on
Node.js **24 LTS**. The `latest` tag on Docker Hub when this was written was a
2022 build (aws-ses-v2-local 2.0.1 on Node.js 16).

Upstream also publishes its own image, `ghcr.io/domdomegg/aws-ses-v2-local`.
This image differs in that it keeps the `pensk/aws-ses-v2-local` name, pins the
base image and dependency tree, runs as a non-root user, and listens on
`0.0.0.0` inside the container so it also starts on hosts without IPv6.

## Run

```sh
docker run --rm -p 127.0.0.1:8005:8005 pensk/aws-ses-v2-local
```

Or build it from this repository:

```sh
docker build -t aws-ses-v2-local .
docker run --rm -p 127.0.0.1:8005:8005 aws-ses-v2-local
```

Then open <http://localhost:8005> to see captured emails in the web viewer.

These commands publish the port on `127.0.0.1` only. The emulator has no
authentication: anyone who can reach the port can read every captured email
from `/store` or the web viewer, or delete them with `/clear-store`. With
`-p 8005:8005`, Docker publishes on all of the host's network interfaces, so
other machines on the network can do that too. If you need access from
another machine, choose that host binding explicitly. The `--host 0.0.0.0`
in the image's command only controls the address inside the container, not
which host interfaces Docker publishes on.

## Send an email

Point an AWS SDK or the AWS CLI at `http://localhost:8005`. The SDK needs a
region and credentials, but the emulator does not check them, so dummy values
work.

JavaScript, with `@aws-sdk/client-sesv2`:

```js
import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';

const ses = new SESv2Client({
  endpoint: 'http://localhost:8005',
  region: 'aws-ses-v2-local',
  credentials: { accessKeyId: 'ANY_STRING', secretAccessKey: 'ANY_STRING' },
});

const { MessageId } = await ses.send(new SendEmailCommand({
  FromEmailAddress: 'sender@example.com',
  Destination: { ToAddresses: ['recipient@example.com'] },
  Content: {
    Simple: {
      Subject: { Data: 'Hello' },
      Body: { Text: { Data: 'Hello from aws-ses-v2-local' } },
    },
  },
}));
```

AWS CLI:

```sh
AWS_ACCESS_KEY_ID=test AWS_SECRET_ACCESS_KEY=test AWS_REGION=aws-ses-v2-local \
  aws sesv2 send-email --endpoint-url http://localhost:8005 \
  --from-email-address sender@example.com \
  --destination ToAddresses=recipient@example.com \
  --content 'Simple={Subject={Data=Hello},Body={Text={Data=Hello from the AWS CLI}}}'
```

Read the captured emails as JSON:

```sh
curl http://localhost:8005/store
```

## What the emulator does

By default emails are **not delivered** anywhere. They are kept in memory and
lost when the container stops. They are only forwarded if you configure an SMTP
server with `SMTP_TRANSPORT` (see below). Upstream documents:

- SES v2 `SendEmail` (simple, raw and template content) and `SendBulkEmail`
- SES v2 email template operations (create, get, list, update, delete, test render) and `GetAccount`
- SES v1 `SendEmail` and `SendRawEmail`
- `GET /store` to list captured emails and templates (`?since=<epoch seconds>` to filter), and `POST /clear-store` to empty it
- `GET /health-check` for readiness checks
- A web viewer at `/`

Other SES v2 operations return `UnknownOperationException`. Upstream
configuration is passed as environment variables, for example
`docker run -e SMTP_TRANSPORT='{"host":"smtp","port":25}' ...` to forward
emails to an SMTP server, or `-e AWS_SES_ACCOUNT=...` to set the `GetAccount`
response. See the [upstream README](https://github.com/domdomegg/aws-ses-v2-local#readme)
for details.

The smoke test below verifies v2 `SendEmail`, the `/store` output and the error
for an invalid request. The other features are documented upstream but not
tested here.

## Changes from the 2022 image

- aws-ses-v2-local 2.0.1 → 2.11.0. See the [upstream changes](https://github.com/domdomegg/aws-ses-v2-local/compare/v2.0.1...v2.11.0) for behaviour changes.
- Node.js 16 → 24. Node.js 16 is end-of-life, and upstream's current dependencies require Node.js 20 or later.
- Runs as the `node` user (uid 1000) instead of root, with `/app` as the working directory instead of `/root`.
- The default command is now `aws-ses-v2-local --host 0.0.0.0`. If you override the command, keep `--host 0.0.0.0`. Without it, upstream listens on `::`, which fails on hosts with IPv6 disabled.
- Image labels use the standard `org.opencontainers.image.*` keys.

## Test

```sh
./test/smoke.sh
```

This builds the image, starts it, waits for it to be ready (bounded timeout),
sends an email with the AWS SDK for JavaScript v3, and checks that `/store`
holds the same sender, recipient, subject and body. It also checks that an
invalid request returns `BadRequestException` and that the server does not
run as root. It needs Docker, plus Node.js 20 or later with npm. The pinned
test client is installed into a temporary directory, and the container and
temporary files are removed when the test exits. Set `IMAGE=<image>` to test
an existing image instead of building one.

## Updating

1. Set the new version in `package.json`, run `npm install --package-lock-only`, and update the `org.opencontainers.image.version` label in the `Dockerfile`.
2. To update Node.js, change the `FROM` tag and digest, and update the `base.*` labels to match.
3. Run `./test/smoke.sh`.
