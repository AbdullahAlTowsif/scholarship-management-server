const express = require('express');
const app = express();
const cors = require('cors');
require('dotenv').config();
const port = process.env.PORT || 5000;
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken')

const corsOptions = {
  origin: [
    'http://localhost:5173',
  ],
  credentials: true,
  optionalSuccessStatus: 200
}


// middlewares
app.use(cors(corsOptions));
app.use(express.json());
app.use(cookieParser());


const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.cy3cu.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    // collections
    const dbCollection = client.db('scholarshipDB')
    const userCollection = dbCollection.collection('users');
    const scholarshipCollection = dbCollection.collection('scholarships');

    // generate jwt
    app.post('/jwt', async (req, res) => {
      const email = req.body
      // create token
      const token = jwt.sign(email, process.env.SECRET_KEY, {
        expiresIn: '3h',
      })
      // console.log(token);
      res
        .cookie('token', token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
        })
        .send({ success: true })
    })

    // get user role
    app.get('/users/role/:email', async (req, res) => {
      const email = req.params.email;
      const result = await userCollection.findOne({ email })
      res.send({ role: result?.role })
    })

    // save or update user in db
    app.post('/users/:email', async (req, res) => {
      const email = req.params.email;
      const query = { email }
      const user = req.body;
      // check if user exists in db
      const isExist = await userCollection.findOne(query);
      if (isExist) {
        return res.send(isExist)
      }
      const result = await userCollection.insertOne({
        ...user,
        role: 'User',
        timestamp: Date.now(),
      })
      res.send(result)
    })

    app.get('/users', async (req, res) => {
      const cursor = userCollection.find();
      const result = await cursor.toArray();
      res.send(result);
    })

    // update user role api
    app.patch("/update-role/:id", async (req, res) => {
      const { id } = req.params;
      const { role } = req.body; // Ensure role exists in request body
      try {
        if (!role) {
          return res.status(400).json({ message: "Role is required" });
        }
        const result = await userCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { role } }
        );
        if (result.modifiedCount > 0) {
          res.status(200).json({ message: "User role updated successfully" });
        } else {
          res.status(404).json({ message: "User not found or role unchanged" });
        }
      } catch (error) {
        console.error("Error updating user role:", error);
        res.status(500).json({ message: "Internal Server Error" });
      }
    });


    // delete users
    app.delete('/users/delete/:id', async (req, res) => {
      const { id } = req.params;
      const result = await userCollection.deleteOne({ _id: new ObjectId(id) });
      if (result.deletedCount > 0) {
        res.status(200).send({ "message": "User deleted successfully" })
      }
      else {
        res.status(400).send({ "message": "User not found" })
      }
    })

    // logOut || clear cookie from browser
    app.get('/logOut', async (req, res) => {
      res.
        clearCookie('token', {
          maxAge: 0,
          secure: process.env.NODE_ENV === 'production',
          sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
        })
        .send({ success: true })
    })

    // save a scholarship data in db
    app.post('/scholarship', async (req, res) => {
      const addScholarship = req.body;
      const result = await scholarshipCollection.insertOne(addScholarship);
      res.send(result);
    })

    app.get('/scholarship', async (req, res) => {
      const cursor = scholarshipCollection.find();
      const result = await cursor.toArray();
      res.send(result);
    })

    // scholarship details api
    app.get('/scholarship/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) }
      const result = await scholarshipCollection.findOne(query);
      res.send(result);
    })

    // update scholarship deatils api
    app.put('/scholarship/update/:id', async (req, res) => {
      const id = req.params.id;
      const scholarshipData = req.body;
      // Remove _id from the scholarshipData if it exists
      delete scholarshipData._id;
      const updatedData = {
        $set: scholarshipData,
      }
      const query = { _id: new ObjectId(id) }
      const options = { upsert: true }
      const result = await scholarshipCollection.updateOne(query, updatedData, options);
      res.send(result)
    })

    // delete scholarship api
    app.delete('/delete/scholarship/:id', async (req, res) => {
      const { id } = req.params;
      const result = await scholarshipCollection.deleteOne({ _id: new ObjectId(id) })
      if (result.deletedCount > 0) {
        res.status(200).send({ message: "Scholarship deleted successfully" })
      }
      else {
        res.status(400).send({ message: "Scholarship Not Found" })
      }
    })

    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get('/', (req, res) => {
  res.send("Scholarship Management Server is running!")
})

app.listen(port, () => {
  console.log(`Scholarship Management server is running on port ${port}`);
})