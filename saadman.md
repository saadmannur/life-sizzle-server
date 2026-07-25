const dns = require("node:dns");
dns.setServers(["8.8.8.8", "8.8.4.4"]);

const express = require('express');
const cors = require('cors')
const app = express()

app.use(cors())
app.use(express.json())

const dotenv = require('dotenv');
dotenv.config()


const { MongoClient, ServerApiVersion } = require('mongodb');
const uri = process.env.MONGO_DB_URI;


const port = process.env.PORT


const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});


const run = async () => {
    try {
        await client.connect();

        const db = client.db('life-sizzle');
        const userCollection = db.collection('user')
        const sessionCollection = db.collection('session')
        
        const lessonCollection = db.collection('lessons')

        //token related work
        const verifyToken = async (req, res, next) => {

            const authHeader = req.headers?.authorization;
            // console.log('from auth header response' ,authHeader);
            if (!authHeader) {
                res.status(401).send({ message: "Unauthorized Access" })
            }

            const token = authHeader.split(" ")[1]
            if (!token) {
                res.status(401).send({ message: "Unauthorized Access" })
            }

            const query = { token: token }

            const session = await sessionCollection.findOne(query)
            if (!session) {
                res.status(401).send({ message: "Unauthorized Access" })
            }
            const userId = session?.userId;

            const userQuery = { _id: userId }
            const user = await userCollection.findOne(userQuery)
            if (!user) {
                res.status(401).send({ message: "Unauthorized Access" })
            }

            req.user = user;

            next()
        }

        app.post('/api/lessons', async (req, res) => {
            const lesson = req.body;
            console.log(lesson)
            const newLesson = {
                ...lesson,
                createAt: new Date(),
            }
            const result = await lessonCollection.insertOne(newLesson);
            res.send(result)
        })



        await client.db('admin').command({ ping: 1 })
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    }
    finally {
        // await client.close();
    }
}
run().catch(console.dir)


app.get('/', (req, res) => {
    res.send('server is running fine')
})

app.listen(port, () => {
    console.log(`Example app listening on port ${port}`)
})