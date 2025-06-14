const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const morgan = require('morgan');
const fs = require('fs');
const path = require('path');
const authenticateToken = require('./middleware/auth.js')

dotenv.config();
const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(morgan('combined', { stream: fs.createWriteStream('server.log', { flags: 'a' }) }));
app.use(express.static(path.join(__dirname, '..', 'client', 'dist')));
const mongoPath = path.join(__dirname, '../secure-db/data/db');

// MongoDB connection
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB connection error:', err));

// Item Schema
const itemSchema = new mongoose.Schema({
  name: { type: String, required: true },
  barcode: { type: String, unique: true, sparse: true },
  costPrice: { type: Number, required: true }, // Renamed from buyingPrice
  sellingPrice: { type: Number, required: true },
  stock: { type: Number, default: 0 },
  type: String,
  size: String,
  taxRate: { type: Number, default: 0 }, // For GST/tax
  lowStockThreshold: { type: Number, default: 10 },
});
const Item = mongoose.model('Item', itemSchema);

// Customer Schema
const customerSchema = new mongoose.Schema({
  name: { type: String, required: true },
  phone: { type: String, required: true },
  address: String,
  accountNumber: { type: String, required: true, unique: true },
  balance: { type: Number, default: 0 },
});
const Customer = mongoose.model('Customer', customerSchema);

// Bill Schema
const billSchema = new mongoose.Schema({
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true },
  items: [{
    itemId: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', required: true },
    quantity: { type: Number, required: true },
    unitPrice: { type: Number, required: true },
    customPrice: { type: Number, required: true }, // Added customPrice
    unitCost: { type: Number, required: true },
    total: { type: Number, required: true },
    totalCost: { type: Number, required: true },
  }],
  subtotal: { type: Number, required: true },
  markup: { type: Number, default: 0 }, // Added markup
  discount: { type: Number, default: 0 },
  grandTotal: { type: Number, required: true },
  grandTotalCost: { type: Number, required: true },
  paymentType: { type: String, enum: ['cash', 'credit'], required: true }, // Simplified payment methods
  partialPayment: { type: Number, default: 0 },
  status: { type: String, enum: ['completed', 'pending'], default: 'pending' },
  createdAt: { type: Date, default: Date.now },
});
const Bill = mongoose.model('Bill', billSchema);

// Payment Schema
const paymentSchema = new mongoose.Schema({
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true },
  amount: { type: Number, required: true },
  paymentMethod: { type: String, enum: ['cash', 'credit'], required: true },
  description: String,
  createdAt: { type: Date, default: Date.now },
});
const Payment = mongoose.model('Payment', paymentSchema);

// Transaction Schema
const transactionSchema = new mongoose.Schema({
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true },
  billId: { type: mongoose.Schema.Types.ObjectId, ref: 'Bill' },
  paymentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Payment' },
  amount: { type: Number, required: true },
  type: { type: String, enum: ['bill', 'payment', 'refund'], required: true },
  description: String,
  createdAt: { type: Date, default: Date.now },
});
const Transaction = mongoose.model('Transaction', transactionSchema);

// Refund Schema
const refundSchema = new mongoose.Schema({
  billId: { type: mongoose.Schema.Types.ObjectId, ref: 'Bill', required: true },
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true },
  amount: { type: Number, required: true },
  items: [{
    itemId: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', required: true },
    quantity: { type: Number, required: true },
  }],
  reason: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});
const Refund = mongoose.model('Refund', refundSchema);



const authRoutes = require('./routes/auth');
app.use('/api/auth', authRoutes);


// Item Routes
app.get('/api/items',authenticateToken, async (req, res) => {
  try {
    const { lowStock } = req.query;
    const query = lowStock === 'true' ? { stock: { $lte: '$lowStockThreshold' } } : {};
    const items = await Item.find(query);
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch items' });
  }
});

app.post('/api/items',authenticateToken, async (req, res) => {
  try {
    const { costPrice, sellingPrice } = req.body;
    if (!costPrice || costPrice <= 0) {
      return res.status(400).json({ error: 'Valid costPrice is required' });
    }
    const item = new Item(req.body);
    await item.save();
    res.status(201).json(item);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.put('/api/items/:id',authenticateToken, async (req, res) => {
  try {
    const item = await Item.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!item) return res.status(404).json({ error: 'Item not found' });
    res.json(item);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/items/:id',authenticateToken, async (req, res) => {
  try {
    const item = await Item.findByIdAndDelete(req.params.id);
    if (!item) return res.status(404).json({ error: 'Item not found' });
    res.json({ message: 'Item deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete item' });
  }
});

// Customer Routes
app.get('/api/customers',authenticateToken, async (req, res) => {
  try {
    const customers = await Customer.find();
    res.json(customers);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch customers' });
  }
});

app.post('/api/customers',authenticateToken, async (req, res) => {
  try {
    const { name, phone, accountNumber, balance } = req.body;
    if (!name || !phone || !accountNumber) {
      return res.status(400).json({ error: 'Name, phone, and account number required' });
    }
    const customer = new Customer(req.body);
    await customer.save();
    res.status(201).json(customer);
  } catch (err) {
    res.status(400).json({ error: err.code === 11000 ? 'Account number exists' : err.message });
  }
});

app.get('/api/customers/:id',authenticateToken, async (req, res) => {
  try {
    const customer = await Customer.findById(req.params.id);
    if (!customer) return res.status(404).json({ error: 'Customer not found' });
    res.json(customer);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch customer' });
  }
});

app.put('/api/customers/:id',authenticateToken, async (req, res) => {
  try {
    const customer = await Customer.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!customer) return res.status(404).json({ error: 'Customer not found' });
    res.json(customer);
  } catch (err) {
    res.status(400).json({ error: err.code === 11000 ? 'Account number exists' : err.message });
  }
});

app.delete('/api/customers/:id',authenticateToken, async (req, res) => {
  try {
    const customer = await Customer.findByIdAndDelete(req.params.id);
    if (!customer) return res.status(404).json({ error: 'Customer not found' });
    await Transaction.deleteMany({ customerId: req.params.id });
    await Bill.deleteMany({ customerId: req.params.id });
    await Payment.deleteMany({ customerId: req.params.id });
    res.json({ message: 'Customer deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete customer' });
  }
});

// Bill Routes
app.get('/api/bills',authenticateToken, async (req, res) => {
  try {
    const bills = await Bill.find()
      .populate('customerId', 'name accountNumber balance') // Added balance
      .populate('items.itemId', 'name type size')
      .sort({ createdAt: -1 });
    res.json(bills);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch bills' });
  }
});

app.get('/api/bills/:id',authenticateToken, async (req, res) => {
  try {
    const bill = await Bill.findById(req.params.id)
      .populate('customerId', 'name balance')
      .populate('items.itemId', 'name type size');
    if (!bill) return res.status(404).json({ error: 'Bill not found' });
    res.json(bill);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch bill' });
  }
});

app.post('/api/bills',authenticateToken, async (req, res) => {
  try {
    const { customerId, items, subtotal, markup, discount, grandTotal, paymentType, partialPayment } = req.body;

    // Validate input
    const errors = [];
    if (!customerId) errors.push('customerId required');
    if (!items?.length) errors.push('items must be a non-empty array');
    if (typeof subtotal !== 'number' || subtotal <= 0) errors.push('subtotal must be positive');
    if (typeof markup !== 'number' || markup < 0 || markup > 100) errors.push('markup must be 0–100');
    if (typeof discount !== 'number' || discount < 0 || discount > 100) errors.push('discount must be 0–100');
    if (typeof grandTotal !== 'number' || grandTotal <= 0) errors.push('grandTotal must be positive');
    if (!['cash', 'credit'].includes(paymentType)) errors.push('paymentType must be cash or credit');
    if (typeof partialPayment !== 'number' || partialPayment < 0) errors.push('partialPayment must be non-negative');
    if (errors.length) return res.status(400).json({ error: errors.join('; ') });

    // Validate customer
    const customer = await Customer.findById(customerId);
    if (!customer) return res.status(404).json({ error: `Customer not found: ${customerId}` });

    // Validate and process items
    const populatedItems = await Promise.all(items.map(async (item, index) => {
      if (!item.itemId || !item.quantity || !item.unitPrice || !item.customPrice || !item.total) {
        throw new Error(`Item ${index}: itemId, quantity, unitPrice, customPrice, total required`);
      }
      const dbItem = await Item.findById(item.itemId);
      if (!dbItem) throw new Error(`Item ${index}: Item not found: ${item.itemId}`);
      if (dbItem.stock < item.quantity) throw new Error(`Item ${index}: Insufficient stock for ${dbItem.name}: ${dbItem.stock} available`);
      if (!dbItem.costPrice && dbItem.costPrice !== 0) throw new Error(`Item ${index}: costPrice missing`);
      return {
        itemId: item.itemId,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        customPrice: item.customPrice,
        unitCost: dbItem.costPrice,
        total: item.quantity * item.customPrice,
        totalCost: item.quantity * dbItem.costPrice,
      };
    }));

    // Verify totals
    const calculatedSubtotal = populatedItems.reduce((sum, item) => sum + item.total, 0);
    if (Math.abs(calculatedSubtotal - subtotal) > 0.01) {
      return res.status(400).json({ error: `Subtotal mismatch: provided ${subtotal}, calculated ${calculatedSubtotal}` });
    }
    const calculatedMarkedUpSubtotal = subtotal + (subtotal * markup / 100);
    const calculatedGrandTotal = calculatedMarkedUpSubtotal - (calculatedMarkedUpSubtotal * discount / 100);
    if (Math.abs(calculatedGrandTotal - grandTotal) > 0.01) {
      return res.status(400).json({ error: `Grand total mismatch: provided ${grandTotal}, calculated ${calculatedGrandTotal}` });
    }

    // Create bill
    const bill = new Bill({
      customerId,
      items: populatedItems,
      subtotal,
      markup,
      discount,
      grandTotal,
      grandTotalCost: populatedItems.reduce((sum, item) => sum + item.totalCost, 0),
      paymentType,
      partialPayment,
      status: partialPayment >= grandTotal ? 'completed' : 'pending',
    });
    await bill.save();

    // Update customer balance
    customer.balance += grandTotal - partialPayment;
    await customer.save();

    // Update item stock
    for (const item of populatedItems) {
      await Item.findByIdAndUpdate(item.itemId, { $inc: { stock: -item.quantity } });
    }

    // Create transactions
    const transactions = [];
    const billTransaction = new Transaction({
      customerId,
      billId: bill._id,
      amount: grandTotal,
      type: 'bill',
      description: `Bill #${bill._id.toString().slice(-6)}`,
    });
    await billTransaction.save();
    transactions.push(billTransaction);

    if (partialPayment > 0) {
      const payment = new Payment({
        customerId,
        amount: partialPayment,
        paymentMethod: paymentType,
        description: `Payment for Bill #${bill._id.toString().slice(-6)}`,
      });
      await payment.save();
      const paymentTransaction = new Transaction({
        customerId,
        billId: bill._id,
        paymentId: payment._id,
        amount: -partialPayment,
        type: 'payment',
        description: `Payment for Bill #${bill._id.toString().slice(-6)}`,
      });
      await paymentTransaction.save();
      transactions.push(paymentTransaction);
    }

    res.status(201).json({ bill, transactions });
  } catch (err) {
    console.error('Error creating bill:', err.message, err.stack);
    res.status(400).json({ error: err.message });
  }
});
// Payment Routes
app.post('/api/payments',authenticateToken, async (req, res) => {
  try {
    const { customerId, amount, paymentMethod, description } = req.body;
    if (!customerId || !amount || amount <= 0 || !['cash', 'credit'].includes(paymentMethod)) {
      return res.status(400).json({ error: 'Invalid payment data' });
    }
    const customer = await Customer.findById(customerId);
    if (!customer) return res.status(404).json({ error: `Customer not found: ${customerId}` });
    const payment = new Payment({
      customerId,
      amount,
      paymentMethod,
      description,
    });
    await payment.save();
    customer.balance -= amount;
    await customer.save();
    const transaction = new Transaction({
      customerId,
      paymentId: payment._id,
      amount: -amount,
      type: 'payment',
      description: description || `Payment of ${amount}`,
    });
    await transaction.save();
    res.status(201).json({ payment, transaction });
  } catch (err) {
    console.error('Error recording payment:', err.message, err.stack);
    res.status(400).json({ error: err.message });
  }
});

// Refund Routes
app.post('/api/refunds',authenticateToken, async (req, res) => {
  try {
    const { billId, customerId, amount, items, reason } = req.body;
    if (!billId || !customerId || !amount || amount <= 0 || !items?.length || !reason) {
      return res.status(400).json({ error: 'Invalid refund data' });
    }

    const bill = await Bill.findById(billId);
    if (!bill || bill.status === 'refunded') {
      return res.status(400).json({ error: 'Bill not found or already refunded' });
    }

    const customer = await Customer.findById(customerId);
    if (!customer) return res.status(404).json({ error: `Customer not found: ${customerId}` });

    // Validate items
    for (const item of items) {
      const billItem = bill.items.find(bi => bi.itemId.toString() === item.itemId.toString());
      if (!billItem || billItem.quantity < item.quantity) {
        return res.status(400).json({ error: `Invalid refund quantity for item ${item.itemId}` });
      }
      await Item.findByIdAndUpdate(item.itemId, { $inc: { stock: item.quantity } });
    }

    const refund = new Refund({
      billId,
      customerId,
      amount,
      items,
      reason,
    });
    await refund.save();

    bill.status = 'refunded';
    await bill.save();

    customer.balance -= amount;
    await customer.save();

    const transaction = new Transaction({
      customerId,
      billId,
      amount: -amount,
      type: 'refund',
      description: `Refund for Bill #${bill._id.toString().slice(-6)}: ${reason}`,
    });
    await transaction.save();

    res.status(201).json({ refund, transaction });
  } catch (err) {
    console.error('Error processing refund:', err.message, err.stack);
    res.status(400).json({ error: err.message });
  }
});

// Sales Report Routes
app.get('/api/reports/sales', async (req, res) => {
  try {
    const { period, startDate, endDate } = req.query;
    if (!['daily', 'weekly', 'monthly', 'custom'].includes(period)) {
      return res.status(400).json({ error: 'Invalid period' });
    }

    let match = {};
    if (period === 'custom') {
      if (!startDate || !endDate) return res.status(400).json({ error: 'Start and end dates required' });
      const start = new Date(startDate);
      const end = new Date(endDate);
      if (isNaN(start.getTime()) || isNaN(end.getTime()) || start > end) {
        return res.status(400).json({ error: 'Invalid date range' });
      }
      match.createdAt = { $gte: start, $lte: end };
    } else {
      const date = new Date();
      if (period === 'daily') date.setDate(date.getDate() - 30);
      else if (period === 'weekly') date.setDate(date.getDate() - 84);
      else if (period === 'monthly') date.setMonth(date.getMonth() - 12);
      match.createdAt = { $gte: date };
    }

    const groupBy = period === 'daily' || period === 'custom' ? { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }
      : period === 'weekly' ? { $concat: [{ $dateToString: { format: '%Y', date: '$createdAt' } }, '-W', { $dateToString: { format: '%U', date: '$createdAt' } }] }
      : { $dateToString: { format: '%Y-%m', date: '$createdAt' } };

    const sales = await Bill.aggregate([
      { $match: { ...match, status: 'completed' } },
      {
        $lookup: {
          from: 'items',
          localField: 'items.itemId',
          foreignField: '_id',
          as: 'itemDetails',
        },
      },
      {
        $addFields: {
          totalCost: {
            $sum: {
              $map: {
                input: '$items',
                as: 'item',
                in: { $multiply: ['$$item.quantity', '$$item.unitCost'] },
              },
            },
          },
          taxTotal: { $sum: '$items.taxRate' },
        },
      },
      {
        $addFields: {
          totalProfit: { $subtract: ['$grandTotal', '$totalCost'] },
        },
      },
      {
        $group: {
          _id: groupBy,
          totalSales: { $sum: '$grandTotal' },
          totalCost: { $sum: '$totalCost' },
          totalProfit: { $sum: '$totalProfit' },
          totalTax: { $sum: '$taxTotal' },
          billCount: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
      {
        $project: {
          period: '$_id',
          totalSales: 1,
          totalCost: 1,
          totalProfit: 1,
          totalTax: 1,
          billCount: 1,
          _id: 0,
        },
      },
    ]);

    res.json(sales);
  } catch (err) {
    console.error('Error fetching sales reports:', err.message, err.stack);
    res.status(500).json({ error: 'Failed to fetch sales reports' });
  }
});

// Export Reports
app.get('/api/reports/export', async (req, res) => {
  try {
    const bills = await Bill.find()
      .populate('customerId', 'name accountNumber')
      .populate('items.itemId', 'name')
      .lean();
    const csv = bills.map(bill => ({
      billId: bill._id,
      customer: bill.customerId.name,
      date: bill.createdAt.toISOString(),
      subtotal: bill.subtotal,
      taxTotal: bill.taxTotal,
      discount: bill.discount,
      grandTotal: bill.grandTotal,
      paymentType: bill.paymentType,
      items: bill.items.map(item => `${item.itemId.name} x${item.quantity}`).join(';'),
    }));
    const fields = ['billId', 'customer', 'date', 'subtotal', 'taxTotal', 'discount', 'grandTotal', 'paymentType', 'items'];
    const csvData = [fields.join(','), ...csv.map(row => fields.map(field => row[field]).join(','))].join('\n');
    res.header('Content-Type', 'text/csv');
    res.attachment('sales_report.csv');
    res.send(csvData);
  } catch (err) {
    res.status(500).json({ error: 'Failed to export reports' });
  }
});


// Transaction Routes
app.get('/api/transactions',authenticateToken, async (req, res) => {
  try {
    const { customerId } = req.query;
    const query = customerId ? { customerId } : {};
    const transactions = await Transaction.find(query)
      .populate('billId', '_id items grandTotal partialPayment status customerId')
      .populate('billId.customerId', 'name balance')
      .sort({ createdAt: -1 });
    res.json(transactions);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch transactions' });
  }
});


// app.get('*', (req, res) => {
//   res.sendFile(path.join(__dirname, '../client2/dist', 'index.html'));
// });

app.listen(process.env.PORT || 5000, () => console.log(`Server running on port ${process.env.PORT || 5000}`));