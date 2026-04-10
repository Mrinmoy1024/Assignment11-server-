require("dotenv").config();
const express = require("express");
const app = express();
const port = 3000;
const cors = require("cors");

const jwt = require("jsonwebtoken");

const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

app.use(
  cors({
    origin: ["http://localhost:5173"],
    credentials: true,
  }),
);
app.use(express.json());

const { MongoClient, ServerApiVersion } = require("mongodb");
const uri = process.env.MONGODB_URI;
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

const verifyJWT = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).send({ message: "Unauthorized access" });
  }
  const token = authHeader.split(" ")[1];
  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).send({ message: "Invalid token" });
    }
    req.user = decoded;
    next();
  });
};

async function run() {
  try {
    await client.connect();

    const db = client.db("contest");
    const contestCollection = db.collection("contest");
    const usersCollection = db.collection("users");
    const leaderboardCollection = db.collection("leaderboard");
    const submissionsCollection = db.collection("submissions");
    const creatorRequestsCollection = db.collection("creatorRequests");
    //add new var here
    app.get("/users/check", async (req, res) => {
      try {
        const { email } = req.query;
        const existing = await usersCollection.findOne({ email });
        if (existing)
          return res.status(409).json({ message: "Email already exists" });
        res.status(200).json({ available: true });
      } catch (err) {
        console.error("GET /users/check error:", err);
        res.status(500).json({ message: "Server error" });
      }
    });

    app.get("/users/role/:email", async (req, res) => {
      try {
        const email = req.params.email;
        const result = await usersCollection.findOne({ email });
        if (!result) return res.status(404).json({ message: "User not found" });
        res.send({ role: result.role });
      } catch (err) {
        console.error("GET /users/role/:email error:", err);
        res.status(500).json({ message: "Server error" });
      }
    });

    app.get("/users", verifyJWT, async (req, res) => {
      try {
        const result = await usersCollection.find().toArray();
        res.send(result);
      } catch (err) {
        res.status(500).json({ message: "Server error" });
      }
    });

    app.post("/users", async (req, res) => {
      const { name, email, photoURL } = req.body;
      if (!name || !email) {
        return res
          .status(400)
          .json({ message: "Name and email are required." });
      }
      try {
        const existing = await usersCollection.findOne({ email });
        if (existing) {
          return res.status(409).json({ message: "User already exists" });
        }
        const result = await usersCollection.insertOne({
          name,
          email,
          photoURL: photoURL || "",
          role: "general user",
          createdAt: new Date(),
        });
        res.send({ success: true, insertedId: result.insertedId });
      } catch (err) {
        console.error("POST /users error:", err);
        res.status(500).send({ message: "Server error" });
      }
    });

    app.post("/jwt", async (req, res) => {
      try {
        const { email } = req.body;
        if (!email) return res.status(400).json({ message: "Email required" });

        const user = await usersCollection.findOne({ email });
        if (!user) return res.status(404).json({ message: "User not found" });

        const token = jwt.sign(
          { email: user.email, role: user.role },
          process.env.JWT_SECRET,
          { expiresIn: "100d" },
        );

        res.json({ token });
      } catch (err) {
        console.error("POST /jwt error:", err);
        res.status(500).json({ message: "Token generation failed" });
      }
    });

    app.get("/contest", async (req, res) => {
      try {
        const result = await contestCollection.find().toArray();
        res.send(result);
      } catch (err) {
        res.status(500).json({ message: "Server error" });
      }
    });

    app.get("/leaderboard", async (req, res) => {
      try {
        const result = await leaderboardCollection
          .find()
          .sort({ rank: 1 })
          .toArray();
        res.send(result);
      } catch (err) {
        res.status(500).json({ message: "Server error" });
      }
    });

    app.get("/recent-winners", async (req, res) => {
      try {
        const result = await leaderboardCollection
          .find()
          .sort({ rank: 1 })
          .limit(6)
          .toArray();
        res.send(result);
      } catch (err) {
        res.status(500).json({ message: "Server error" });
      }
    });
    app.get("/admin/stats", verifyJWT, async (req, res) => {
      try {
        const totalUsers = await usersCollection.countDocuments();
        const totalContests = await contestCollection.countDocuments();
        const approvedContests = await contestCollection.countDocuments({
          status: "approved",
        });
        const pendingContests = await contestCollection.countDocuments({
          status: "pending",
        });
        const activeContests = await contestCollection.countDocuments({
          status: "active",
        });
        const totalSubmissions = await submissionsCollection.countDocuments();
        const creatorRequests = await creatorRequestsCollection.countDocuments({
          
          status: "pending",
        });
        res.send({
          totalUsers,
          totalContests,
          approvedContests,
          pendingContests,
          activeContests,
          totalSubmissions,
          creatorRequests,
        });
      } catch (err) {
        res.status(500).json({ message: err.message });
      }
    });

    app.get("/creator/stats", verifyJWT, async (req, res) => {
      try {
        const email = req.query.email;
        const myContests = await contestCollection.countDocuments({
          createdBy: email,
        });
        const approvedContests = await contestCollection.countDocuments({
          createdBy: email,
          status: "approved",
        });
        const pendingContests = await contestCollection.countDocuments({
          createdBy: email,
          status: "pending",
        });
        const activeContests = await contestCollection.countDocuments({
          createdBy: email,
          status: "active",
        });
        const totalSubmissions = await submissionsCollection.countDocuments({
          createdBy: email,
        });
        const winners = await submissionsCollection.countDocuments({
          createdBy: email,
          winner: true,
        });
        res.send({
          myContests,
          approvedContests,
          pendingContests,
          activeContests,
          totalSubmissions,
          winners,
        });
      } catch (err) {
        res.status(500).json({ message: err.message });
      }
    });
    app.get("/user/stats", verifyJWT, async (req, res) => {
      try {
        const email = req.query.email;
        const participated = await submissionsCollection.countDocuments({
          userEmail: email,
        });
        const wins = await submissionsCollection.countDocuments({
          userEmail: email,
          winner: true,
        });
        const pending = await submissionsCollection.countDocuments({
          userEmail: email,
          winner: { $exists: false },
        });
        const winRate =
          participated > 0 ? Math.round((wins / participated) * 100) : 0;
        res.send({ participated, wins, pending, winRate });
      } catch (err) {
        res.status(500).json({ message: err.message });
      }
    });
    app.patch("/users/:id", verifyJWT, async (req, res) => {
      try {
        const { ObjectId } = require("mongodb");
        const id = req.params.id;
        const { role } = req.body;
        const result = await usersCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { role } },
        );
        res.send(result);
      } catch (err) {
        res.status(500).json({ message: "Server error" });
      }
    });
    app.delete("/users/:id", verifyJWT, async (req, res) => {
      try {
        const { ObjectId } = require("mongodb");
        const id = req.params.id;
        const result = await usersCollection.deleteOne({
          _id: new ObjectId(id),
        });
        res.send(result);
      } catch (err) {
        res.status(500).json({ message: "Server error" });
      }
    });
    app.get("/contest/:id", async (req, res) => {
      try {
        const { ObjectId } = require("mongodb");
        const result = await contestCollection.findOne({
          _id: new ObjectId(req.params.id),
        });
        if (!result)
          return res.status(404).json({ message: "Contest not found" });
        res.send(result);
      } catch (err) {
        res.status(500).json({ message: "Server error" });
      }
    });
    app.delete("/contest/:id", verifyJWT, async (req, res) => {
      try {
        const { ObjectId } = require("mongodb");
        const result = await contestCollection.deleteOne({
          _id: new ObjectId(req.params.id),
        });
        res.send(result);
      } catch (err) {
        res.status(500).json({ message: "Server error" });
      }
    });

    app.patch("/contest/:id", verifyJWT, async (req, res) => {
      try {
        const { ObjectId } = require("mongodb");
        const result = await contestCollection.updateOne(
          { _id: new ObjectId(req.params.id) },
          { $set: req.body },
        );
        res.send(result);
      } catch (err) {
        res.status(500).json({ message: "Server error" });
      }
    });
    app.patch("/users/update/:email", verifyJWT, async (req, res) => {
      try {
        const email = req.params.email;
        const { name, photoURL } = req.body;
        const result = await usersCollection.updateOne(
          { email },
          { $set: { name, photoURL } },
        );
        res.send(result);
      } catch (err) {
        res.status(500).json({ message: "Server error" });
      }
    });
    app.post("/contest", verifyJWT, async (req, res) => {
      try {
        const contest = req.body;
        const result = await contestCollection.insertOne(contest);
        res.send({ success: true, insertedId: result.insertedId });
      } catch (err) {
        res.status(500).json({ message: "Server error" });
      }
    });

    app.post("/create-payment-intent", verifyJWT, async (req, res) => {
      try {
        const { price } = req.body;
        const amount = Math.round(price * 100); // convert to cents

        const paymentIntent = await stripe.paymentIntents.create({
          amount,
          currency: "usd",
          payment_method_types: ["card"],
        });

        res.send({ clientSecret: paymentIntent.client_secret });
      } catch (err) {
        res.status(500).json({ message: err.message });
      }
    });
    app.get("/submissions/user", verifyJWT, async (req, res) => {
      try {
        const email = req.query.email;
        const result = await submissionsCollection
          .find({ userEmail: email })
          .toArray();
        res.send(result);
      } catch (err) {
        res.status(500).json({ message: "Server error" });
      }
    });
    app.post("/submissions", verifyJWT, async (req, res) => {
      try {
        const submission = req.body;
        const existing = await submissionsCollection.findOne({
          contestId: submission.contestId,
          userEmail: submission.userEmail,
        });
        if (existing) {
          return res.status(409).json({ message: "Already submitted" });
        }
        const result = await submissionsCollection.insertOne({
          ...submission,
          winner: false,
          submittedAt: new Date(),
        });
        res.send({ success: true, insertedId: result.insertedId });
      } catch (err) {
        res.status(500).json({ message: "Server error" });
      }
    });
    app.post("/creator-request", verifyJWT, async (req, res) => {
      try {
        const request = req.body;
        const existing = await creatorRequestsCollection.findOne({
          userEmail: request.userEmail,
          status: "pending",
        });
        if (existing) {
          return res.status(409).json({ message: "Request already pending" });
        }
        const result = await creatorRequestsCollection.insertOne(request);
        res.send({ success: true, insertedId: result.insertedId });
      } catch (err) {
        res.status(500).json({ message: "Server error" });
      }
    });
    app.get("/creator-requests", verifyJWT, async (req, res) => {
      try {
        const result = await creatorRequestsCollection
          .find()
          .sort({ requestedAt: -1 })
          .toArray();
        res.send(result);
      } catch (err) {
        res.status(500).json({ message: "Server error" });
      }
    });

    app.patch("/creator-request/:id/approve", verifyJWT, async (req, res) => {
      try {
        const { ObjectId } = require("mongodb");
        const id = req.params.id;
        const request = await creatorRequestsCollection.findOne({
          _id: new ObjectId(id),
        });
        if (!request)
          return res.status(404).json({ message: "Request not found" });

        await creatorRequestsCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { status: "approved" } },
        );
        await usersCollection.updateOne(
          { email: request.userEmail },
          { $set: { role: "creator" } },
        );
        res.send({ success: true });
      } catch (err) {
        res.status(500).json({ message: "Server error" });
      }
    });

    app.patch("/creator-request/:id/reject", verifyJWT, async (req, res) => {
      try {
        const { ObjectId } = require("mongodb");
        const id = req.params.id;
        await creatorRequestsCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { status: "rejected" } },
        );
        res.send({ success: true });
      } catch (err) {
        res.status(500).json({ message: "Server error" });
      }
    });
    //new line

    console.log("MongoDB connected");
  } finally {
  }
}

run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Server running...");
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
