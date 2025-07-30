const express = require('express');
const mysql = require('mysql2');
const session = require('express-session');
const flash = require('connect-flash');
const multer = require('multer');
const app = express();
const bcrypt = require('bcrypt');

// Set up multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'public/images'); // Directory to save uploaded files
    },
    filename: (req, file, cb) => {
        cb(null, file.originalname); 
    }
});

const upload = multer({ storage: storage });

const connection = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'Makisan9725',
    database: 'nigga'
});

connection.connect((err) => {
    if (err) {
        console.error('Error connecting to MySQL:', err);
        return;
    }
    console.log('Connected to MySQL database');
});

// Set up view engine
app.set('view engine', 'ejs');
//  enable static files
app.use(express.static('public'));
// enable form processing
app.use(express.urlencoded({
    extended: false
}));

//TO DO: Insert code for Session Middleware below 
app.use(session({
    secret: 'secret',
    resave: false,
    saveUninitialized: true,
    // Session expires after 1 week of inactivity
    cookie: { maxAge: 1000 * 60 * 60 * 24 * 7 } 
}));

app.use(flash());

// Middleware to check if user is logged in
const checkAuthenticated = (req, res, next) => {
    if (req.session.user) {
        return next();
    } else {
        req.flash('error', 'Please log in to view this resource');
        res.redirect('/login');
    }
};

// Middleware to check if user is admin
const checkAdmin = (req, res, next) => {
    if (req.session.user && req.session.user.role === 'admin') {
        return next();
    }
    req.flash('error', 'Access denied');
    res.redirect('/dashboard');
};

app.get('/dashboard', checkAuthenticated, (req, res) => {
    const query = 'SELECT * FROM packages';
    connection.query(query, (err, results) => {
        if (err) throw err;
        res.render('dashboard', {
            user: req.session.user,
            packages: results
        });
    });
});

// Middleware: Require Login
function requireLogin(req, res, next) {
  if (!req.session.user) return res.redirect('/login');
  next();
}

// Middleware: Admin Only
function isAdmin(req, res, next) {
  if (req.session.user && req.session.user.role === 'admin') {
    return next();
  }
  return res.status(403).send('Access Denied: Admin only');
}


// Define routes
app.get('/', (req, res) => {
  // Assuming you store logged-in user info in req.session.user
  res.render('index', { user: req.session.user || null });
});


app.get('/list', checkAuthenticated, checkAdmin, (req, res) => {
    // Fetch data from MySQL
    connection.query('SELECT * FROM destinations', (error, results) => {
        if (error) throw error;
        res.render('list', { destinations: results, user: req.session.user });
    });
});

//register route
// GET /register - show registration form
app.get('/register', (req, res) => {
  res.render('register', { error: null, formData: {}, user: req.session.user });
});

// POST /register - handle form submission
app.post('/register', async (req, res) => {
  const { name, email, password, role } = req.body;
  const formData = { name, email, role };

  if (!name || !email || !password) {
    return res.render('register', { error: 'All fields except role are required.', formData, user: req.session.user });
  }

  try {
    connection.query('SELECT * FROM users WHERE email = ?', [email], async (err, results) => {
      if (err) {
        return res.render('register', { error: 'Database error.', formData, user: req.session.user });
      }

      if (results.length > 0) {
        return res.render('register', { error: 'Email is already registered.', formData, user: req.session.user });
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      const userRole = role || 'user';

      const sql = 'INSERT INTO users (customer_name, email, password, role, created_at) VALUES (?, ?, ?, ?, NOW())';
      connection.query(sql, [name, email, hashedPassword, userRole], (err, result) => {
        if (err) {
          return res.render('register', { error: 'Failed to register user.', formData, user: req.session.user });
        }
        res.redirect('/login');
      });
    });
  } catch (error) {
    console.error(error);
    res.render('register', { error: 'Unexpected error.', formData, user: req.session.user });
  }
});



// Login/logout routes
app.get('/login', (req, res) => {
    const errors = req.flash('error');
    console.log('Flash errors:', errors);
    res.render('login', { messages: errors });
});

app.post('/login', (req, res) => {
  const email = req.body.email;
  const password = req.body.password;

  // Query by email only


  
  const sql = 'SELECT * FROM users WHERE email = ?';
  connection.query(sql, [email], async (err, results) => {
    if (err) {
      console.error(err);
      return res.send('Database error');
    }

    if (results.length === 0) {
      req.flash('error', 'Invalid login');
      return res.redirect('/login');
    }

    const user = results[0];

    // Compare entered password with stored bcrypt hash
    const match = await bcrypt.compare(password, user.password);

    if (match) {
      req.session.user = user;
      res.redirect('/customers');
    } else {
      req.flash('error', 'Invalid login');
      res.redirect('/login');
    }
  });
});


app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
});

// View all packages (public)
app.get('/packages', (req, res) => {
    const query = 'SELECT * FROM packages';
    connection.query(query, (err, results) => {
        if (err) throw err;
        res.render('packages', {
            packages: results,
            user: req.session.user,
            messages: req.flash('success')
        });
    });
});

// Add new package (must be logged in)
app.get('/packages/add', checkAuthenticated, (req, res) => {
    res.render('addPackage', { messages: req.flash('error') });
});

app.post('/packages/add', checkAuthenticated, (req, res) => {
    const { name, description, price, duration } = req.body;

    if (!name || !price || !duration) {
        req.flash('error', 'Name, price, and duration are required.');
        return res.redirect('/packages/add');
    }

    const sql = 'INSERT INTO packages (name, description, price, duration) VALUES (?, ?, ?, ?)';
    connection.query(sql, [name, description, price, duration], (err) => {
        if (err) throw err;
        req.flash('success', 'Package added successfully');
        res.redirect('/packages');
    });
});

// Edit package
app.get('/packages/edit/:id', checkAuthenticated, (req, res) => {
    const sql = 'SELECT * FROM packages WHERE id = ?';
    connection.query(sql, [req.params.id], (err, results) => {
        if (err) throw err;
        res.render('editPackage', {
            package: results[0],
            messages: req.flash('error')
        });
    });
});

app.post('/packages/edit/:id', checkAuthenticated, (req, res) => {
    const { name, description, price, duration } = req.body;
    const sql = 'UPDATE packages SET name = ?, description = ?, price = ?, duration = ? WHERE id = ?';
    connection.query(sql, [name, description, price, duration, req.params.id], (err) => {
        if (err) throw err;
        req.flash('success', 'Package updated successfully');
        res.redirect('/packages');
    });
});

// Delete package
app.get('/packages/delete/:id', checkAuthenticated, (req, res) => {
    const sql = 'DELETE FROM packages WHERE id = ?';
    connection.query(sql, [req.params.id], (err) => {
        if (err) throw err;
        req.flash('success', 'Package deleted successfully');
        res.redirect('/packages');
    });
});

app.get('/destinations', checkAuthenticated, (req, res) => {
    const search = req.query.search;

    let sql = 'SELECT * FROM destinations';
    const params = [];

    if (search) {
        sql += ' WHERE city LIKE ? OR country LIKE ?';
        const keyword = '%' + search + '%';
        params.push(keyword, keyword);
    }

    connection.query(sql, params, (error, results) => {
        if (error) throw error;

        res.render('destinations', {
            destinations: results,
            user: req.session.user,
            search: search
        });
    });
});


app.get('/destinations/:id', checkAuthenticated, (req, res) => {
    const destinationId = req.params.id;

    connection.query('SELECT * FROM destinations WHERE id = ?', [destinationId], (error, results) => {
        if (error) throw error;

        if (results.length > 0) {
            res.render('destinations', {
                destination: results[0],
                user: req.session.user
            });
        } else {
            res.status(404).send('Destination not found');
        }
    });
});



app.get('/addDestination', checkAuthenticated, checkAdmin, (req, res) => {
    res.render('addDestination', {user: req.session.user } ); 
});

app.post('/addDestination', upload.single('image'),  (req, res) => {
    
    const { country, city, attractions} = req.body;
    let image;
    if (req.file) {
        image = req.file.filename; // Save only the filename
    } else {
        image = null;
    }

    const sql = 'INSERT INTO destinations (country, city, attractions, image) VALUES (?, ?, ?, ?)';
    
    connection.query(sql , [country, city, attractions, image], (error, results) => {
        if (error) {
            // Handle any error that occurs during the database operation
            console.error("Error adding destination:", error);
            res.status(500).send('Error adding destination');
        } else {
            // Send a success response
            res.redirect('/list');
        }
    });
});


app.get('/updateDestination/:id',checkAuthenticated, checkAdmin, (req,res) => {
    const id = req.params.id;
    const sql = 'SELECT * FROM destinations WHERE id = ?';

    connection.query(sql , [id], (error, results) => {
        if (error) throw error;

        if (results.length > 0) {
            res.render('updateDestination', { destination: results[0] ,user:req.session.user});
        } else {
            res.status(404).send('Destination not found');
        }
    });
});

app.post('/updateDestination/:id', upload.single('image'), (req, res) => {
    const id = req.params.id;
    const { country, city, attractions } = req.body;
    let image  = req.body.currentImage; //retrieve current image filename
    if (req.file) { //if new image is uploaded
        image = req.file.filename; // set image to be new image filename
    } 

    const sql = 'UPDATE destinations SET country = ? , city = ?, attractions = ?, image =? WHERE id = ?';
    connection.query(sql, [country, city, attractions, image, id], (error, results) => {
        if (error) {
            // Handle any error that occurs during the database operation
            console.error("Error updating destination:", error);
            res.status(500).send('Error updating destination');
        } else {
            // Send a success response
            res.redirect('/list');
        }
    });
});

app.get('/deleteDestination/:id', (req, res) => {
    const id = req.params.id;

    connection.query('DELETE FROM destinations WHERE id = ?', [id], (error, results) => {
        if (error) {
            // Handle any error that occurs during the database operation
            console.error("Error deleting destination:", error);
            res.status(500).send('Error deleting destination');
        } else {
            // Send a success response
            res.redirect('/list');
        }
    });
});


// View all customers (admin + user)
app.get('/customers', checkAuthenticated, (req, res) => {
    const sql = 'SELECT * FROM customers';
    connection.query(sql, (err, results) => {
        if (err) throw err;
        res.render('customer', { user: req.session.user, customers: results });
    });
});

// Search customers (admin + user)
app.post('/customers/search', checkAuthenticated, (req, res) => {
    const keyword = '%' + req.body.keyword + '%';
    const sql = 'SELECT * FROM customers WHERE name LIKE ? OR email LIKE ?';
    connection.query(sql, [keyword, keyword], (err, results) => {
        if (err) throw err;
        res.render('customer', { user: req.session.user, customers: results });
    });
});

// Admin: Add new customer (Form)
app.get('/customers/add', checkAuthenticated, checkAdmin, (req, res) => {
    res.render('add', { messages: req.flash('error') });
});


// Admin: Add new customer (Submit)
app.post('/customers/add', checkAuthenticated, checkAdmin, (req, res) => {
    const { name, email, phone } = req.body;
    if (!name || !email) {
        req.flash('error', 'Name and email are required');
        return res.redirect('/customers/add');
    }

    const sql = 'INSERT INTO customers (name, email, phone) VALUES (?, ?, ?)';
    connection.query(sql, [name, email, phone], (err) => {
        if (err) throw err;
        res.redirect('/customers');
    });
});

// Admin: Edit customer (Form)
app.get('/customers/edit/:id', checkAuthenticated, checkAdmin, (req, res) => {
    const sql = 'SELECT * FROM customers WHERE id = ?';
    connection.query(sql, [req.params.id], (err, results) => {
        if (err) throw err;
        if (results.length === 0) return res.send('Customer not found');
        res.render('edit', { customer: results[0], messages: req.flash('error') });
    });
});

// Admin: Update customer
app.post('/customers/edit/:id', checkAuthenticated, checkAdmin, (req, res) => {
    const { name, email, phone } = req.body;
    const sql = 'UPDATE customers SET name = ?, email = ?, phone = ? WHERE id = ?';
    connection.query(sql, [name, email, phone, req.params.id], (err) => {
        if (err) throw err;
        res.redirect('/customers');
    });
});

// Admin: Delete customer
app.get('/customers/delete/:id', checkAuthenticated, checkAdmin, (req, res) => {
    const sql = 'DELETE FROM customers WHERE id = ?';
    connection.query(sql, [req.params.id], (err) => {
        if (err) throw err;
        res.redirect('/customers');
    });
});


// Bookings List
app.get('/bookings', requireLogin, (req, res) => {
  let query = '';
  let params = [];

  if (req.session.user.role === 'admin') {
    query = `
      SELECT b.*, c.name AS customer_name, p.name AS package_name 
      FROM bookings b 
      JOIN customers c ON b.customer_id = c.id 
      JOIN packages p ON b.package_id = p.id
      ORDER BY b.booking_date DESC
    `;
  } else {
    query = `
      SELECT b.*, p.name AS package_name 
      FROM bookings b 
      JOIN packages p ON b.package_id = p.id
      WHERE b.customer_id = ?
      ORDER BY b.booking_date DESC
    `;
    params = [req.session.user.id];
  }

  connection.query(query, params, (err, bookings) => {
    if (err) return res.status(500).send('Database error loading bookings.');
    res.render('bookings', { bookings, user: req.session.user });
  });
});

// Search Bookings (Admin Only)
app.get('/bookings/search', requireLogin, isAdmin, (req, res) => {
  const { customer, date } = req.query;
  let query = `
    SELECT b.*, c.name AS customer_name, p.name AS package_name 
    FROM bookings b 
    JOIN customers c ON b.customer_id = c.id 
    JOIN packages p ON b.package_id = p.id
    WHERE 1=1
  `;
  const params = [];

  if (customer) {
    query += ' AND c.name LIKE ?';
    params.push(`%${customer}%`);
  }
  if (date) {
    query += ' AND DATE(b.booking_date) = ?';
    params.push(date);
  }
  query += ' ORDER BY b.booking_date DESC';

  connection.query(query, params, (err, bookings) => {
    if (err) return res.status(500).send('Search error.');
    res.render('bookings', { bookings, user: req.session.user });
  });
});

// Add Booking – Form
app.get('/bookings/add', requireLogin, isAdmin, (req, res) => {
connection.query('SELECT id, name FROM customers ORDER BY name', (err, customers) => {
    if (err) return res.status(500).send('Error loading customers.');
    connection.query('SELECT id, name, price FROM packages ORDER BY name', (err, packages) => {
      if (err) return res.status(500).send('Error loading packages.');
      res.render('add_booking', { customers, packages, user: req.session.user });
    });
  });
});

// Add Booking – Submit
app.post('/bookings/add', requireLogin, isAdmin, (req, res) => {
  const { customer_id, package_id, booking_date, status } = req.body;
  if (!customer_id || !package_id || !booking_date) {
    return res.status(400).send('Missing required fields.');
  }

  connection.query(
    'INSERT INTO bookings (customer_id, package_id, booking_date, status) VALUES (?, ?, ?, ?)',
    [customer_id, package_id, booking_date, status || 'pending'],
    (err) => {
      if (err) return res.status(500).send('Database error creating booking.');
      res.redirect('/bookings');
    }
  );
});

// Edit Booking – Form
app.get('/bookings/edit/:id', requireLogin, isAdmin, (req, res) => {
  const { id } = req.params;

  connection.query(
    `SELECT b.*, c.name AS customer_name, p.name AS package_name 
     FROM bookings b 
     JOIN customers c ON b.customer_id = c.id 
     JOIN packages p ON b.package_id = p.id
     WHERE b.id = ?`,
    [id],
    (err, results) => {
      if (err || results.length === 0) return res.status(404).send('Booking not found.');

      const booking = results[0];

    connection.query('SELECT id, name FROM packages ORDER BY name', (err, packages) => {
        if (err) return res.status(500).send('Error loading packages.');
        connection.query('SELECT id, name FROM customers ORDER BY name', (err, customers) => {
          if (err) return res.status(500).send('Error loading customers.');
          res.render('edit_booking', { booking, packages, customers, user: req.session.user });
        });
      });
    }
  );
});

// Edit Booking – Submit
app.post('/bookings/edit/:id', requireLogin, isAdmin, (req, res) => {
  const { id } = req.params;
  const { customer_id, package_id, booking_date, status } = req.body;
  connection.query(
    'UPDATE bookings SET customer_id = ?, package_id = ?, booking_date = ?, status = ? WHERE id = ?',
    [customer_id, package_id, booking_date, status, id],
    (err) => {
      if (err) return res.status(500).send('Update failed.');
      res.redirect('/bookings');
    }
  );
});

// Delete Booking
app.post('/bookings/delete/:id', requireLogin, isAdmin, (req, res) => {
  const { id } = req.params;
connection.query('DELETE FROM bookings WHERE id = ?', [id], (err) => {
    if (err) return res.status(500).send('Delete failed.');
    res.redirect('/bookings');
  });
});

app.get('/payments', (req, res) => {
  const sql = 'SELECT * FROM payments';
  connection.query(sql, (err, results) => {
    if (err) throw err;
    res.render('payments', { payments: results ,user:req.session.user});
  });
});


app.get('/payments/add', (req, res) => {
    res.render('addpayment', { user: req.session.user });
});

app.post('/payments/add', (req, res) => {
    const { booking_id, amount, payment_date, status } = req.body;
    const sql = 'INSERT INTO payments (booking_id, amount, payment_date, status) VALUES (?, ?, ?, ?)';
    connection.query(sql, [booking_id, amount, payment_date, status], (err) => {
        if (err) throw err;
        res.redirect('/');
    });
});

app.get('/payments/edit/:id', (req, res) => {
    const sql = 'SELECT * FROM payments WHERE id = ?';
    connection.query(sql, [req.params.id], (err, result) => {
        if (err) throw err;
        if (result.length === 0) return res.status(404).send('Payment not found');
        res.render('editpayment', { payment: result[0] });
    });
});

app.post('/payments/edit/:id', (req, res) => {
    const { booking_id, amount, payment_date, status } = req.body;
    const sql = 'UPDATE payments SET booking_id=?, amount=?, payment_date=?, status=? WHERE id=?';
    connection.query(sql, [booking_id, amount, payment_date, status, req.params.id], (err) => {
        if (err) throw err;
        res.redirect('/');
    });
});

app.post('/payments/delete/:id', (req, res) => {
    const sql = 'DELETE FROM payments WHERE id = ?';
    connection.query(sql, [req.params.id], (err) => {
        if (err) throw err;
        res.redirect('/');
    });
});

app.get('/payments/search', (req, res) => {
    const { booking_id, status } = req.query;
    let sql = 'SELECT * FROM payments WHERE 1=1';
    let params = [];

    if (booking_id) {
        sql += ' AND booking_id LIKE ?';
        params.push(`%${booking_id}%`);
    }

    if (status) {
        sql += ' AND status LIKE ?';
        params.push(`%${status}%`);
    }

    connection.query(sql, params, (err, results) => {
        if (err) throw err;
        res.render('payments', { payments: results });
    });
});


// List reviews
app.get('/reviews', (req, res) => {
    let sql = `SELECT * FROM reviews WHERE 1=1`;
    let params = [];

    if (req.query.rating) {
        sql += ` AND rating = ?`;
        params.push(req.query.rating);
    }
    if (req.query.package_id) {
        sql += ` AND package_id = ?`;
        params.push(req.query.package_id);
    }

    connection.query(sql, params, (err, results) => {
        if (err) throw err;
        res.render('review', { reviews: results, isAdmin, query: req.query || {}  ,user:req.session.user});
    });
});

// Add review form
app.get('/reviews/add', (req, res) => {
    if (!isAdmin) return res.status(403).send('Forbidden');

    const customersQuery = 'SELECT id, name FROM customers';
    const packagesQuery = 'SELECT id, name FROM packages';

    connection.query(customersQuery, (err, customers) => {
        if (err) throw err;
        connection.query(packagesQuery, (err, packages) => {
            if (err) throw err;
            res.render('addreview', { customers, packages });
        });
    });
});

// Add review POST
app.post('/reviews/add', (req, res) => {
    if (!isAdmin) return res.status(403).send('Forbidden');

    const { customer_id, package_id, rating, comment } = req.body;
    const sql = `INSERT INTO reviews (customer_id, package_id, rating, comment, created_at) VALUES (?, ?, ?, ?, NOW())`;
    connection.query(sql, [customer_id, package_id, rating, comment], err => {
        if (err) throw err;
        res.redirect('/reviews');
    });
});

// Edit review form
app.get('/reviews/edit/:id', (req, res) => {
    if (!isAdmin) return res.status(403).send('Forbidden');

    const reviewQuery = 'SELECT * FROM reviews WHERE id = ?';
    const customersQuery = 'SELECT id, name FROM customers';
    const packagesQuery = 'SELECT id, name FROM packages';

    connection.query(reviewQuery, [req.params.id], (err, reviewResult) => {
        if (err) throw err;
        if (reviewResult.length === 0) return res.status(404).send('Review not found');

        connection.query(customersQuery, (err, customers) => {
            if (err) throw err;
            connection.query(packagesQuery, (err, packages) => {
                if (err) throw err;
                res.render('editreview', { review: reviewResult[0], customers, packages });
            });
        });
    });
});

// Edit review POST
app.post('/reviews/edit/:id', (req, res) => {
    if (!isAdmin) return res.status(403).send('Forbidden');

    const { customer_id, package_id, rating, comment } = req.body;
    const sql = `UPDATE reviews SET customer_id=?, package_id=?, rating=?, comment=? WHERE id=?`;
    connection.query(sql, [customer_id, package_id, rating, comment, req.params.id], err => {
        if (err) throw err;
        res.redirect('/reviews');
    });
});

// Delete review
app.post('/reviews/delete/:id', (req, res) => {
    if (!isAdmin) return res.status(403).send('Forbidden');

    const sql = `DELETE FROM reviews WHERE id = ?`;
    connection.query(sql, [req.params.id], err => {
        if (err) throw err;
        res.redirect('/reviews');
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port http://localhost:${PORT}`));
