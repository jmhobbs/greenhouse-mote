/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `npm run dev` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `npm run deploy` to publish your worker
 *
 * Bind resources to your worker in `wrangler.jsonc`. After adding bindings, a type definition for the
 * `Env` object can be regenerated with `npm run cf-typegen`.
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */

export default {
	async fetch(request, env, ctx): Promise<Response> {
		const buffer = await request.arrayBuffer();
		const dv = new DataView(buffer)
		var version = dv.getUint32(0, true);
		var nonce = dv.getUint32(4, true);
		var error = dv.getInt32(8, true);
		var temperature = Math.floor(dv.getFloat32(12, true) * 100)/100;
		var humidity = Math.floor(dv.getFloat32(16, true) * 100)/100;
		var signature = buffer.slice(20);

		env.RECORDS.writeDataPoint({
			'doubles': [temperature, humidity],
		});

		return Response.json({
			version, nonce, error, temperature, humidity, signature: Array.from(new Uint8Array(signature))
		});
	},
} satisfies ExportedHandler<Env>;
