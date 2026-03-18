import { AutoRouter } from 'itty-router'
import { env } from "cloudflare:workers";

const key = await crypto.subtle.importKey(
	"raw",
	Uint8Array.fromBase64(env.HMAC_SECRET),
	{ name: "HMAC", hash: {name: "SHA-256"} },
	false,
	["verify"]
);

const router = AutoRouter()

const query = `
SELECT
	timestamp,
	double1 AS temperature,
	double2 AS humidity
FROM 'greenhouse-mote-records'
WHERE timestamp > NOW() - INTERVAL '1' DAY
ORDER BY timestamp DESC
`;

const API = `https://api.cloudflare.com/client/v4/accounts/${env.ACCOUNT_ID}/analytics_engine/sql`;

	router.get('/', async () => {
	const queryResponse = await fetch(API, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${env.API_TOKEN}`,
		},
		body: query,
	});

	if (queryResponse.status != 200) {
		console.error("Error querying:", await queryResponse.text());
		return new Response("An error occurred!", { status: 500 });
	}

	const queryJSON = await queryResponse.json();
	const rows = queryJSON.data.map(row => `[${row.timestamp}] Temperature: ${row.temperature}  Humidity: ${row.humidity}`);
	return new Response(rows.join("\n"), { status: 200, headers: { "Content-Type": "text/plain" } });
});

router.post('/update', async (request, env, ctx): Promise<Response> => {
	const buffer = await request.arrayBuffer();
	const dv = new DataView(buffer, 0, 32)

	var version = dv.getUint32(0, true);
	if(version != 1) {
		return new Response("Unsupported version", { status: 400 });
	}

	var enc = new TextDecoder("utf-8");
	var name = enc.decode(new Uint8Array(buffer, 4, 12)).replace(/\0/g, '');
	console.log('Name:', name);

	var error = dv.getInt32(20, true);
	if(error != 0) {
		console.error("Device reported error code: " + error);
	} else {
		var temperature = Math.floor(dv.getFloat32(24, true) * 100)/100;
		var humidity = Math.floor(dv.getFloat32(28, true) * 100)/100;
		var expectedSignature = new DataView(buffer, 32);

		const hmacValid = await crypto.subtle.verify("HMAC", key, expectedSignature, buffer.slice(0, 32));

		if (!hmacValid) {
			return new Response("Invalid HMAC signature", { status: 400 });
		}

		env.RECORDS.writeDataPoint({
			'doubles': [temperature, humidity],
		});
	}

	return new Response("OK");
})

export default { ...router }
