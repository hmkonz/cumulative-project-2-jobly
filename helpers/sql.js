const { BadRequestError } = require("../expressError");

// This function assigns the $ and index number to the column names and assigns their values to the corresponding data that is sent along in the request body 

// the data in req.body (i.e. { firstName: 'Percy', lastName: 'Konz', email: 'Percy@gmail.com' } is passed in to this function as the object 'dataToUpdate'. 

// what is passed in as jsToSql should be an object with key/value pairs of the changed column names that correspond to the data that was sent along with the request  (i.e. { firstName: 'first_name', lastName: 'last_name', isAdmin: 'is_admin' })). 

function sqlForPartialUpdate(dataToUpdate, jsToSql) {
   // 'keys' is an array of the keys in dataToUpdate (i.e. [ 'firstName', 'lastName', 'email' ])
  const keys = Object.keys(dataToUpdate);
  // if no keys are found in the dataToUpdate object that means no data was found in req.body. Therefore, the length of keys will equal zero which will then throw an error
  if (keys.length === 0) throw new BadRequestError("No data");
 
  // iterate over the 'keys' array with map and for every key ("colName") and array index, change the column name to what it was before being changed with AS in the UPDATE query and set its value equal to $(idx+1).
  // {firstName: 'Percy', lastName: 'Konz', ... } => ['"first_name"=$1', '"last_name"=$2', ...]
  const cols = keys.map((colName, idx) =>
      `"${jsToSql[colName] || colName}"=$${idx + 1}`,
  );

  // returns an object with setcols equal to 'cols' (i.e. ['"first_name"=$1', '"last_name"=$2', ...]) joined together to equal a single string { setCols: '"first_name"=$1, "last_name"=$2, "email"=$3' }
  // and values equal to { values: [ 'Percy', 'Konz', 'Percy@gmail.com' ] }, the values in the data in req.body "dataToUpdate"
  return {
    setCols: cols.join(", "),
    values: Object.values(dataToUpdate),
  };
}

module.exports = { sqlForPartialUpdate };
