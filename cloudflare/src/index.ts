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

router.get('/', async () => {
	return new Response("Hi, yes, hello.");
});

router.post('/update', async (request, env, ctx): Promise<Response> => {
	const buffer = await request.arrayBuffer();
	const dv = new DataView(buffer, 0, 20)

	var version = dv.getUint32(0, true);
	if(version != 1) {
		return new Response("Unsupported version", { status: 400 });
	}

	// var nonce = dv.getUint32(4, true);
	var error = dv.getInt32(8, true);
	if(error != 0) {
		console.error("Device reported error code: " + error);
	} else {
		var temperature = Math.floor(dv.getFloat32(12, true) * 100)/100;
		var humidity = Math.floor(dv.getFloat32(16, true) * 100)/100;
		var expectedSignature = new DataView(buffer, 20); // buffer.slice(20);

		const hmacValid = await crypto.subtle.verify("HMAC", key, expectedSignature, buffer.slice(0, 20));

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
