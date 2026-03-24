import { AutoRouter } from 'itty-router'
import * as z from "zod";
import { env } from "cloudflare:workers";

const key = await crypto.subtle.importKey(
	"raw",
	Uint8Array.fromBase64(env.HMAC_SECRET_KEY),
	{ name: "HMAC", hash: {name: "SHA-256"} },
	false,
	["verify"]
);

const router = AutoRouter()

const query = `
SELECT
	unixepoch(Timestamp) AS timestamp,
	Temperature AS temperature,
	Humidity AS humidity
FROM Records
WHERE Timestamp > datetime('now', '-1 day')
ORDER BY Timestamp DESC
`;

const querySchema = z.object({
	results: z.array(
		z.object({
			timestamp: z.number(),
			temperature: z.number(),
			humidity: z.number(),
		})
	)
});


router.get('/', async () => {
	return new Response(`<!doctype>
<html lang="en">
	<head>
		<meta charset="utf-8">
		<meta name="viewport" content="width=device-width, initial-scale=1">
		<title>Greenhouse Mote</title>
		<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/alvaromontoro/almond.css@latest/dist/almond.lite.min.css" />
		<script src="https://cdn.jsdelivr.net/npm/uplot@1.6.32/dist/uPlot.iife.min.js"></script>
		<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/uplot@1.6.32/dist/uPlot.min.css">
		<style>
			#error {
				background: pink;
				padding: 5px;
				border: 1px solid red;
				border-radius: 5px;
				display: none;
			}
		</style>
	</head>
	<body>
		<h1>Greenhouse Mote</h1>
		<div id="error"></div>
		<h2>Last 24 Hours</h2>
		<table>
			<thead>
				<tr>
					<th>Min Temperature</th>
					<th>Max Temperature</th>
					<th>Min Humidity</th>
					<th>Max Humidity</th>
				</tr>
			</thead>
			<tbody>
				<tr>
					<td id="min-temperature"></td>
					<td id="max-temperature"></td>
					<td id="min-humidity"></td>
					<td id="max-humidity"></td>
				</tr>
			</tbody>
		</table>
		<div id="chart"></div>


	<script>
		fetch('/recent.json')
			.then(response => response.json())
			.then(init)
			.catch(e => {
				console.error("Error fetching data:", e);
				document.getElementById("error").textContent = "An error occurred while fetching data.";
				document.getElementById("error").style.display = 'block';
			})

		function init(adata) {
			document.getElementById("min-temperature").textContent = Math.min(...adata.temperature).toFixed(2) + "C";
			document.getElementById("max-temperature").textContent = Math.max(...adata.temperature).toFixed(2) + "C";
			document.getElementById("min-humidity").textContent = Math.min(...adata.humidity).toFixed(2) + "%";
			document.getElementById("max-humidity").textContent = Math.max(...adata.humidity).toFixed(2) + "%";

			const data = [
				adata.x,
				adata.temperature,
				adata.humidity,
			];

			const size = getSize();

			let opts = {
				id: "chart1",
				class: "my-chart",
				width: size.width,
				height: size.height,
				series: [
					{ show: false },
					{
						show: true,
						spanGaps: false,
						label: "Temperature",
						value: (self, rawValue) => rawValue == null ? '' : rawValue.toFixed(2) + "C",
						stroke: "red",
						width: 1,
					},
					{
						show: true,
						spanGaps: false,
						label: "Humidity",
						value: (self, rawValue) => rawValue == null ? '' : rawValue.toFixed(2) + "%",
						stroke: 'blue',
						width: 1,
					}
				],
			};

			let plot = new uPlot(opts, data, document.getElementById('chart'));

			function getSize() {
				const rect = document.getElementById('chart').getBoundingClientRect();
				return {
					width: rect.width,
					height: rect.width < 800 ? 400 : 600,
				}
			}

			window.addEventListener("resize", e => { plot.setSize(getSize()); });
		}
	</script>
	</body>
</html>`, { headers: { 'content-type': 'text/html' }});
})

router.get('/recent.json', async () => {
	try {
		const response = await env.database.prepare(query).run();
		if(response.success !== true) {
			console.error(response);
			return Response.json({error: 'query failed'}, { status: 500 });
		}

		const queryJSON = querySchema.parse(response);

		const x = queryJSON.results.map(row => row.timestamp);
		const yTemperature = queryJSON.results.map(row => row.temperature);
		const yHumidity = queryJSON.results.map(row => row.humidity);

		return Response.json({
			x,
			temperature: yTemperature,
			humidity: yHumidity,
		})
	} catch(e) {
		return Response.json({error: e}, { status: 500 });
	}
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

		await env.database.prepare('INSERT INTO Records (Name, Temperature, Humidity) VALUES (?, ?, ?)').bind(name, temperature, humidity).run();
	}

	return new Response("OK");
})

export default { ...router }
