var mongoose = require('mongoose');
var Schema = mongoose.Schema;

productSchema = new Schema( {
	name: String,
	desc: String,
	niverH: Date(UTC),
	image: String,
	niverM: Date(UTC),
	user_id: Schema.ObjectId,
	is_delete: { type: Boolean, default: false },
	date : { type : Date, default: Date.now }
}),
product = mongoose.model('product', productSchema);

module.exports = product;