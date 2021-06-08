import {buffer} from 'micro';
import * as admin from 'firebase-admin';

//secure a connection to firebase from the backend
const serviceAccount = require('../../../permissions.json');

const app = !admin.apps.length ? admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
}) : admin.app();

//establish connection to stripe
const stripe = require('stripe')(`${process.env.STRIPE_SECRET_KEY}`);
const endpointSecret = `${process.env.STRIPE_SIGNING_SECRET}`;

const fulfillOrder = async (session) => {
    console.log('Fulfilling order', session);
    return app.firestore().collection('users')
    .doc(session.metadata.email)
    .collection('orders')
    .doc(session.id)
    .set({
        amount: session.amount_total / 100,
        amount_shipping: session.total_details.amount_shipping / 100,
        images: JSON.parse(session.metadata.images),
        timestamp: admin.firestore.FieldValue.serverTimestamp()
    })
    .then(() => {
        console.log(`SUCCESS: Order ${session.id} had been added to the DB`);
    }).catch((err) => {
        console.log(`ERROR: ${err} MESSAGE: ${err.message}`)
    })
}

export default async (req, res) => {
    console.log("webhook file: test 1")

    if (req.method === 'POST'){
        console.log("webhook file: in post")
        const requestBuffer = await buffer(req);
        const payload = requestBuffer.toString();
        const sig = req.headers["stripe-signature"];

        let event;

        //verify event posted came from stripe
        try {
            event = stripe.webhooks.constructEvent(payload, sig, endpointSecret);
        }catch(err){
            console.log(`ERROR ${err.message}`)
            return res.status(400).send("webhook error: ", err.message);
        }

        //handle checkout session completed event
        if(event.type === 'checkout.session.completed'){
            console.log("webhook file: in event")

            const session = event.data.object;
            
            //fulfill order
            return fulfillOrder(session)
            .then(() => res.status(200))
            .catch((err) => res.status(400).send(`Webhook Error: ${err.message}`));
            
        }
    }
};

export const config = {
    api: {
        bodyParser: false, //want request as a stream instead of a passed object
        externalResolver: true
    }
};