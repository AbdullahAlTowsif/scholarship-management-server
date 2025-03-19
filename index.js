const express = require('express');
const app = express();
const cors = require('cors');
require('dotenv').config();
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
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
    const paymentCollection = dbCollection.collection('payments');
    const appliedScholarshipCollection = dbCollection.collection('appliedScholarships');

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

    // Apply for a Scholarship
    app.post('/applied-scholarship', async (req, res) => {
      const application = req.body;
      // console.log("Incoming application data:", application); // Debugging log
      if (!application.scholarshipId || !application.userEmail || !application.userName) {
        return res.status(400).json({ error: "Scholarship ID, User Email, and User Name are required" });
      }

      try {
        // Check if user has already applied
        const existingApplication = await appliedScholarshipCollection.findOne({
          scholarshipId: application.scholarshipId,
          userEmail: application.userEmail
        });

        if (existingApplication) {
          return res.status(400).json({ error: "You have already applied for this scholarship" });
        }

        // Save the application
        const newApplication = {
          ...application,
          status: 'pending',
          appliedAt: new Date(),
        };

        const result = await appliedScholarshipCollection.insertOne(newApplication);
        res.status(201).json({ message: "Application submitted successfully", applicationId: result.insertedId });
      } catch (error) {
        console.error("Error saving application:", error);
        res.status(500).json({ error: "Failed to apply for scholarship" });
      }
    });

    // Add the following route to your Express server
    // app.get('/applied-scholarship/:email', async (req, res) => {
    //   const { email } = req.params;
    //   console.log(email);

    //   try {
    //     // Query the database to find scholarships where the user has applied
    //     const appliedScholarships = await appliedScholarshipCollection.find({ userEmail: email }).toArray();

    //     if (appliedScholarships.length === 0) {
    //       return res.status(404).json({ message: 'No applied scholarships found for this user' });
    //     }

    //     // If scholarships are found, return them
    //     res.status(200).json(appliedScholarships);
    //   } catch (error) {
    //     console.error('Error fetching applied scholarships:', error);
    //     res.status(500).json({ message: 'Internal Server Error' });
    //   }
    // });

    app.get('/applied-scholarship/:email', async (req, res) => {
      const { email } = req.params;
      console.log(email);

      try {
        // Perform aggregation to join appliedScholarshipCollection with scholarshipCollection
        const appliedScholarshipsWithDetails = await appliedScholarshipCollection.aggregate([
          {
            $match: { userEmail: email }, // Match the user by email
          },
          {
            $addFields: {
              scholarshipId: { $toObjectId: '$scholarshipId' }
            }
          },
          {
            $lookup: {
              from: 'scholarships', // Join with the scholarships collection
              localField: 'scholarshipId', // Field in appliedScholarshipCollection
              foreignField: '_id', // Field in scholarships collection
              as: 'scholarshipDetails', // Resulting array of matched documents
            },
          },
          {
            $unwind: {
              path: '$scholarshipDetails', // Unwind the array to get the scholarship details in each document
              preserveNullAndEmptyArrays: true, // Keep documents even if no match was found
            },
          },
          {
            $project: {
              // Optional: Project the fields you need in the final response
              _id: 1,
              universityName: '$scholarshipDetails.universityName',
              universityAddress: '$scholarshipDetails.universityCity',
              applicationFeedback: 1, // From appliedScholarshipCollection
              subjectCategory: '$scholarshipDetails.subjectCategory',
              degree: '$scholarshipDetails.degree',
              aplicationFees: '$scholarshipDetails.aplicationFees',
              serviceCharge: '$scholarshipDetails.serviceCharge',
              status: 1, // From appliedScholarshipCollection
            },
          },
        ]).toArray();

        if (appliedScholarshipsWithDetails.length === 0) {
          return res.status(404).json({ message: 'No applied scholarships found for this user' });
        }

        // If scholarships are found, return them
        res.status(200).json(appliedScholarshipsWithDetails);
      } catch (error) {
        console.error('Error fetching applied scholarships:', error);
        res.status(500).json({ message: 'Internal Server Error' });
      }
    });


    // Cancel an application by scholarship ID
    app.delete('/applied-scholarship/:scholarshipId', async (req, res) => {
      const { scholarshipId } = req.params;

      try {
        const result = await appliedScholarshipCollection.deleteOne({ _id: new MongoClient.ObjectID(scholarshipId) });
        if (result.deletedCount === 0) {
          return res.status(404).json({ message: 'Application not found' });
        }
        res.status(200).json({ message: 'Application canceled successfully' });
      } catch (error) {
        console.error('Error canceling application:', error);
        res.status(500).json({ message: 'Failed to cancel application' });
      }
    });


    // payment API
    app.post("/enroll/payments", async (req, res) => {
      const { scholarshipId, transactionId, userName, userEmail, postedUserEmail, aplicationFees } = req.body;

      if (!scholarshipId || !transactionId || !userName || !userEmail || !postedUserEmail || !aplicationFees) {
        return res.status(400).json({ error: "All fields are required" });
      }

      try {
        const payment = {
          scholarshipId,
          transactionId,
          userName,
          userEmail,
          postedUserEmail,
          aplicationFees,
          createdAt: new Date(),
        };

        // const paymentsCollection = db.collection("payments");
        await paymentCollection.insertOne(payment);

        res.status(201).json({ message: "Payment recorded successfully!" });
      } catch (error) {
        console.error("Error saving payment:", error);
        res.status(500).json({ error: "Failed to save payment" });
      }
    });

    app.post("/api/create-payment-intent", async (req, res) => {
      const { aplicationFees, scholarshipId } = req.body;

      if (!aplicationFees || !scholarshipId) {
        return res.status(400).json({ error: "Amount and classId are required" });
      }

      try {
        const paymentIntent = await stripe.paymentIntents.create({
          amount: Math.round(aplicationFees * 100), // Stripe uses cents
          currency: "usd",
          payment_method_types: ["card"],
        });

        res.status(200).json({ clientSecret: paymentIntent.client_secret });
      } catch (error) {
        console.error("Error creating payment intent:", error);
        res.status(500).json({ error: "Failed to create payment intent" });
      }
    });


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