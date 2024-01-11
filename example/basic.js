//import with relative paths to shim for browser
//this way the same code will work on the web as it does in node
//litteraly the same file without even transpiling,  
//but you can transpile if you want.
import VanillaTest from '../node_modules/vanilla-test/index.js';

const test=new VanillaTest;

//setup
const num1=1;
const num2=2;
function sum(a,b){
    return a+b;
}


try{
    test.expects('num1 to be a number');    
    test.is.number(num1);
}catch(err){
    console.log(`${err.name} : ${err.message}`);
    test.fail();
}
test.pass();
test.done();

try{
    test.expects('num2 to be a a number');    
    test.is.number(num2);
}catch(err){
    console.log(`${err.name} : ${err.message}`);
    test.fail();
}
test.pass();
test.done();

//this test should fail for demonstration purposes
try{
    test.expects('num1 == num2');    
    test.compare(num1,num2);
}catch(err){
    console.log(`test.compare(${num1},${num2}); : num1 and num2 were not equal`);
    test.fail();
}
test.pass();
test.done();


try{
    test.expects('sum(num1,num2) to be equal to num1+num2');    

    test.compare(
        sum(num1,num2),
        num1+num2
    );
}catch(err){
    console.log(`sum(${num1},${num2}); was not equal to num1+num2`);
    test.fail();
}
test.pass();
test.done();

try{
    test.expects('A TypeError when type checks fail');    
    test.is.boolean(new Array(2));
}catch(err){
    try{
        test.is.typeError(err);
    }catch{
        console.log(`${err.name} : ${err.message}`);
        test.fail();
    }
    test.pass();
}
test.fail();
test.done();

test.report();