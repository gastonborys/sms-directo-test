require('dotenv').config();
const express = require('express');
const app = express();
const mongoose = require('mongoose');
const { v4: uuidv4} = require('uuid');

const mongoDbUrl 	= process.env.MONGO_DB_URL;
const USERNAME 		= process.env.USERNAME;
const PASSWORD		= process.env.PASSWORD;
const INTERVAL 		= parseInt(process.env.INTERVAL) || 10;


mongoose.connect(mongoDbUrl, 
	{ useNewUrlParser: true, useUnifiedTopology: true }, (err) => {
		if (err) {
			console.error('Error connecting to MongoDB:', err);
		} else {
			console.log('Connected to MongoDB!');
		}
	});
	
const smsSchema = new mongoose.Schema({
	message_id		: String,
	ani				: String,
	dnis			: String,
	message			: String,
	command			: String,
	serviceType		: String,
	longMessageMode	: String,
	status			: { type: String, default: 'new' },
	createdAt		: { type: Date, default: Date.now }
});

const configSchema = new mongoose.Schema({
	param: String,
	value: String
});

const statusSchema = new mongoose.Schema({
    value: { type: String, required: true },
    weight: { type: Number, required: true }
});

const Sms = mongoose.model('Sms', smsSchema);
const Status = mongoose.model('Status', statusSchema);
const Config = mongoose.model('Config', configSchema);

app.use(express.urlencoded({ extended: true }));

app.post('/api', (req, res) => {
	const { username, password, ani, dnis, message, command, serviceType, longMessageMode } = req.query;
	
	if (username === USERNAME && password === PASSWORD) {

		const sms = new Sms({
			message_id: uuidv4(),
			ani,
			dnis,
			message,
			command,
			serviceType,
			longMessageMode
		});

		sms.save((err, sms) => {
			if (err) {
				console.error(err);
				res.status(500).send({ error: 'Error al guardar el SMS' });
			}
			else {
				res.send({ message_id: sms.message_id });
			}
		});
	} else {
		res.status(401).send({ error: 'Credenciales incorrectas' });
	}
});

const getStatus = async () => {
	try {
		const statuses = await Status.find();
		const totalWeight = statuses.reduce((sum, status) => sum + status.weight, 0);
		let random = Math.random() * totalWeight;
		
		for (const status of statuses) {
			if (random < status.weight) {
				return status.value;
			}
			random -= status.weight;
		}

	}
	catch (error) {
		console.error("getStatus", error);
	}
};

setInterval(() => {
	Config.findOne({ param: 'webhook' }, (err, config) => {
		if (err) {
			console.error(err);
		}
		else if (config) {
			
			Sms.find({ status: 'new' }, (err, smsList) => {
				if (err) {
					console.error(err);
				}
				else {
					smsList.forEach(async (sms) => {
						const call_response = await getStatus();

						switch (call_response){
							case "ANSWERED":
								sms.status	= "DELIVRD";
								break;
							case "CONGESTION":
							case "NOANSWER":
								sms.status	= "UNDELIV";
								break;
							default:
								sms.status	= "UNDELIV";
						}

						const data = {
							IDMensaje		: sms.message_id,
							estatus			: sms.status,
							num_celular		: sms.dnis,
							fecha_archivo	: sms.ani,
							HoraEntrega		: sms.createdAt
						};

						const formData = new URLSearchParams();
						
						Object.keys(data).forEach((key) => {
							formData.append(key, data[key]);
						});
						
						const queryParams = formData.toString();
						const urlWithParams = `${config.value}?${queryParams}`;
						
						const options = {
							method: 'POST',
							headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
						};
						
						fetch(urlWithParams, options)
						.then((res) => res.text())						
						.then((body) => {

							sms.save((err) => {

								if (err) {
									console.error(err);
								}
							});
						})
						.catch((err) => {
							console.error(err);
						});
						
						
					});
				}
			});
		}
	});
}, INTERVAL * 1000);

app.listen(3250, () => {
	console.log('Server listening on port 3000');
});