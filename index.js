const dns = require("node:dns");
dns.setServers(["8.8.8.8", "8.8.4.4"]);

const express = require('express');
const cors = require('cors')
const app = express()

app.use(cors())
app.use(express.json())

const dotenv = require('dotenv');
dotenv.config()


const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
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
        const favoriteCollection = db.collection('favorites');
        const reportCollection = db.collection("lessonReports");
        const commentCollection = db.collection("comments");

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

        //verify user role
        const verifyUser = (req, res, next) => {
            // console.log(req.user)
            if (req.user?.role !== 'user') {
                return res.status(403).send({ message: 'Forbidden Access' })
            }
            next()
        }
        const verifyAdmin = (req, res, next) => {
            if (req.user?.role !== 'admin') {
                return res.status(403).send({ message: 'Forbidden Access' })
            }
            next()
        }

        app.get('/api/lessons', async (req, res) => {
            const query = {};

            // console.log(req.query.userId, 'from response');

            if (req.query.userId) {
                query.userId = req.query.userId;
            }
            if (req.query.category) {
                query.category = req.query.category;
            }

            //browse job related query
            if (req.query.tone) {
                query.tone = req.query.tone;
            }
            if (req.query.category) {
                query.category = req.query.category;
            }
            if (req.query.search) {
                // case-insensitive partial match on title

                query.headline = { $regex: req.query.search, $options: 'i' };  //search by only title
                //     query.$or = [
                //         { title: { $regex: req.query.search, $options: 'i' } },
                //         { companyName: { $regex: req.query.search, $options: 'i' } }, // search by multiples items
                //         { city: { $regex: req.query.search, $options: 'i' } },
                //         { country: { $regex: req.query.search, $options: 'i' } },
                //     ]; 
            }

            //pagination related query
            if (req.query.page) {
                const page = req.query.page;
                const perPage = req.query.perPage || 12;
                const skipItems = (page - 1) * perPage

                const totalItems = await lessonCollection.countDocuments(query)

                const cursor = lessonCollection.find(query).skip(skipItems).limit(perPage);
                const lessons = await cursor.sort({ createAt: -1 }).toArray()
                return res.send({ lessons, totalItems })
            }

            const result = await lessonCollection.find(query).sort({ createAt: -1 }).toArray();
            res.send({
                lessons: result,
                totalItems: result.length
            })
        })

        app.get('/api/lessons/:id', async (req, res) => {
            const { id } = req.params;
            // console.log('console response',id);
            const query = {
                _id: new ObjectId(id)
            };
            const result = await lessonCollection.findOne(query);
            res.send(result)
        })

        //like
        app.patch("/api/lessons/:id/like", verifyToken, async (req, res) => {

            const { id } = req.params;
            const userId = req.user._id.toString();
            // console.log(req.user);

            const lesson = await lessonCollection.findOne({
                _id: new ObjectId(id)
            });

            if (!lesson) {
                return res.status(404).send({
                    message: "Lesson not found"
                });
            }

            const alreadyLiked = lesson.likes?.includes(userId);

            if (alreadyLiked) {

                await lessonCollection.updateOne(
                    { _id: new ObjectId(id) },
                    {
                        $pull: {
                            likes: userId
                        },
                        $inc: {
                            likesCount: -1
                        }
                    }
                );

                return res.send({
                    liked: false
                });

            }

            await lessonCollection.updateOne(
                { _id: new ObjectId(id) },
                {
                    $addToSet: {
                        likes: userId
                    },
                    $inc: {
                        likesCount: 1
                    }
                }
            );

            res.send({
                liked: true
            });

        }
        );

        //favorite
        app.patch("/api/lessons/:id/favorite", verifyToken, async (req, res) => {

            const { id } = req.params;

            const userId = req.user._id.toString();

            const favorite = await favoriteCollection.findOne({
                lessonId: id,
                userId
            });

            if (favorite) {

                await favoriteCollection.deleteOne({
                    _id: favorite._id
                });

                await lessonCollection.updateOne(
                    {
                        _id: new ObjectId(id)
                    },
                    {
                        $inc: {
                            favoritesCount: -1
                        }
                    }
                )

                return res.send({
                    saved: false
                });

            }

            await favoriteCollection.insertOne({

                lessonId: id,

                userId,

                createdAt: new Date()

            });

            await lessonCollection.updateOne(
                {
                    _id: new ObjectId(id)
                },
                {
                    $inc: {
                        favoritesCount: 1
                    }
                }
            );

            res.send({
                saved: true
            });

        }
        );
        app.get("/api/favorites/check/:lessonId", verifyToken, async (req, res) => {

            const { lessonId } = req.params;

            const userId = req.user._id.toString();

            const favorite = await favoriteCollection.findOne({
                lessonId,
                userId
            });

            const totalItems = await favoriteCollection.countDocuments({ lessonId })
            // console.log(totalItems);

            res.send({
                saved: !!favorite,
                totalItems
            });

        }
        );
        app.get("/api/favorites", verifyToken, async (req, res) => {

            const userId = req.user._id.toString();

            const favorites = await favoriteCollection.aggregate([

                {
                    $match: {
                        userId
                    }
                },

                {
                    $addFields: {
                        lessonObjectId: {
                            $toObjectId: "$lessonId"
                        }
                    }
                },

                {
                    $lookup: {
                        from: "lessons",
                        localField: "lessonObjectId",
                        foreignField: "_id",
                        as: "lesson"
                    }
                }, 
                {
                    $unwind: "$lesson"
                },
                {
                    $replaceRoot: {
                        newRoot: "$lesson"
                    }
                }

            ]).toArray();

            res.send(favorites);

        });
        app.delete("/api/favorites/:lessonId", verifyToken, async (req, res) => {

            const { lessonId } = req.params;

            const userId = req.user._id.toString();

            const favorite = await favoriteCollection.findOne({
                lessonId,
                userId
            });

            if (!favorite) {
                return res.status(404).send({
                    message: "Favorite not found."
                });
            }

            await favoriteCollection.deleteOne({
                _id: favorite._id
            });

            await lessonCollection.updateOne(
                {
                    _id: new ObjectId(lessonId)
                },
                {
                    $inc: {
                        favoritesCount: -1
                    }
                }
            );

            res.send({
                success: true,
                message: "Removed from favorites."
            });

        });
        app.get("/api/favorites/count", verifyToken, async (req, res) => {

            const userId = req.user._id.toString();

            const totalItems = await favoriteCollection.countDocuments({
                userId
            });

            res.send({
                totalItems
            });

        });
        
        //report
        app.post("/api/lesson-reports", verifyToken, async (req, res) => {

            const { lessonId, reason } = req.body;

            const user = req.user;

            const alreadyReported = await reportCollection.findOne({
                lessonId,
                reporterId: user._id.toString()
            });

            if (alreadyReported) {
                return res.status(400).send({
                    message: "You already reported this lesson."
                });
            }

            const report = {
                lessonId,
                reporterId: user._id.toString(),
                reporterEmail: user.email,
                reason,
                status: "pending",
                createdAt: new Date()
            };

            await reportCollection.insertOne(report);

            res.send({
                success: true,
                message: "Report submitted."
            });

        });

        //comments
        app.post("/api/comments", verifyToken, async (req, res) => {

            const { lessonId, text } = req.body;

            if (!lessonId || !text?.trim()) {
                return res.status(400).send({
                    message: "Lesson ID and comment are required."
                });
            }

            const user = req.user;

            const comment = {
                lessonId,
                userId: user._id.toString(),
                userName: user.name,
                userImage: user.image,
                text: text.trim(),
                createdAt: new Date(),
                updatedAt: null
            };

            const result = await commentCollection.insertOne(comment);

            res.send({
                success: true,
                insertedId: result.insertedId
            });

        });
        app.get("/api/comments/:lessonId", async (req, res) => {

            const { lessonId } = req.params;

            const comments = await commentCollection
                .find({ lessonId })
                .sort({ createdAt: -1 })
                .toArray();

            res.send({
                comments,
                totalItems: comments.length
            });

        });

        //lessons
        app.post('/api/lessons', verifyToken, verifyUser, async (req, res) => {
            const lesson = req.body;
            // console.log(lesson)
            const newLesson = {
                ...lesson,
                likes: [],
                likesCount: 0,
                favoritesCount: 0,
                isFeatured: false,
                isReviewed: false,
                createAt: new Date(),
                updatedAt: null
            }
            const result = await lessonCollection.insertOne(newLesson);
            res.send(result)
        })

        app.delete("/api/lessons/:id", verifyToken, verifyUser, async (req, res) => {

            const { id } = req.params;

            const lesson = await lessonCollection.findOne({
                _id: new ObjectId(id)
            });

            if (!lesson) {
                return res.status(404).send({
                    message: "Lesson not found."
                });
            }

            if (lesson.userId !== req.user._id.toString()) {
                return res.status(403).send({
                    message: "Forbidden Access"
                });
            }

            await favoriteCollection.deleteMany({
                lessonId: id
            });

            await reportCollection.deleteMany({
                lessonId: id
            });

            await lessonCollection.deleteOne({
                _id: new ObjectId(id)
            });

            res.send({
                success: true,
                message: "Lesson deleted successfully."
            });

        });

        app.patch("/api/lessons/:id", verifyToken, verifyUser, async (req, res) => {

            const { id } = req.params;
            // console.log(id, 'console response');

            const lesson = await lessonCollection.findOne({
                _id: new ObjectId(id)
            });

            if (!lesson) {
                return res.status(404).send({
                    message: "Lesson not found."
                });
            }

            if (lesson.userId !== req.user._id.toString()) {
                return res.status(403).send({
                    message: "Forbidden Access"
                });
            }

            const updatedLesson = req.body;

            const result = await lessonCollection.updateOne(
                {
                    _id: new ObjectId(id)
                },
                {
                    $set: {
                        ...updatedLesson,
                        updatedAt: new Date()
                    }
                }
            );

            res.send(result);

        });



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