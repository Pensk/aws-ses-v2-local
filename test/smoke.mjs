// Sends an email through a running aws-ses-v2-local with the AWS SDK and checks
// that the emulator captured it. Run via smoke.sh, which starts the container.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {SESv2Client, SendEmailCommand} from '@aws-sdk/client-sesv2';

const endpoint = process.env.SES_ENDPOINT ?? 'http://localhost:8005';
const READY_TIMEOUT_MS = 30_000;
const REQUEST_TIMEOUT_MS = 10_000;
const TOTAL_TIMEOUT_MS = 60_000;

setTimeout(() => {
	console.error(`FAIL: smoke test did not finish within ${TOTAL_TIMEOUT_MS / 1000}s`);
	process.exit(1);
}, TOTAL_TIMEOUT_MS).unref();

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const waitForReady = async () => {
	const deadline = Date.now() + READY_TIMEOUT_MS;
	let lastError;
	while (Date.now() < deadline) {
		try {
			const res = await fetch(`${endpoint}/health-check`, {signal: AbortSignal.timeout(2_000)});
			if (res.status === 200) {
				return;
			}

			lastError = new Error(`health check returned HTTP ${res.status}`);
		} catch (error) {
			lastError = error;
		}

		await sleep(500);
	}

	throw new Error(`emulator not ready after ${READY_TIMEOUT_MS / 1000}s: ${lastError?.message}`);
};

const ses = new SESv2Client({
	endpoint,
	region: 'aws-ses-v2-local',
	credentials: {accessKeyId: 'AKIAEXAMPLE', secretAccessKey: 'dummy-secret'},
	maxAttempts: 1,
	requestHandler: {connectionTimeout: 5_000, requestTimeout: REQUEST_TIMEOUT_MS},
});

const runId = randomUUID();
const email = {
	from: 'sender@example.com',
	to: 'recipient@example.com',
	subject: `aws-ses-v2-local smoke test ${runId}`,
	text: `Plain text body for run ${runId}`,
	html: `<p>HTML body for run <b>${runId}</b></p>`,
};

console.log(`Waiting for ${endpoint} ...`);
await waitForReady();
console.log('Emulator is ready');

const response = await ses.send(new SendEmailCommand({
	FromEmailAddress: email.from,
	Destination: {ToAddresses: [email.to]},
	Content: {
		Simple: {
			Subject: {Data: email.subject},
			Body: {Text: {Data: email.text}, Html: {Data: email.html}},
		},
	},
}));
assert.equal(response.$metadata.httpStatusCode, 200, 'SendEmail HTTP status');
assert.equal(typeof response.MessageId, 'string', 'SendEmail MessageId type');
assert.ok(response.MessageId.length > 0, 'SendEmail MessageId is empty');
console.log(`SendEmail OK, MessageId=${response.MessageId}`);

// GET /store is the emulator's documented API for reading captured emails.
const storeRes = await fetch(`${endpoint}/store`, {signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)});
assert.equal(storeRes.status, 200, 'GET /store HTTP status');
const store = await storeRes.json();
const captured = store.emails.filter((e) => e.messageId === response.MessageId);
assert.equal(captured.length, 1, `expected exactly one stored email with MessageId ${response.MessageId}`);
const [stored] = captured;
assert.equal(stored.from, email.from);
assert.deepEqual(stored.destination, {to: [email.to], cc: [], bcc: []});
assert.equal(stored.subject, email.subject);
assert.equal(stored.body.text, email.text);
assert.equal(stored.body.html, email.html);
console.log('Captured email matches sender, recipient, subject, text and HTML body');

// An invalid request must surface as an SES error, not a silent success.
await assert.rejects(
	ses.send(new SendEmailCommand({
		Destination: {ToAddresses: [email.to]},
		Content: {Simple: {Subject: {Data: 'no sender'}, Body: {Text: {Data: 'no sender'}}}},
	})),
	(error) => error.name === 'BadRequestException' && error.$metadata?.httpStatusCode === 400,
	'SendEmail without FromEmailAddress should fail with BadRequestException',
);
console.log('SendEmail without a sender is rejected with BadRequestException');

console.log('PASS');
