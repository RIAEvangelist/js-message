import VanillaTest from '../node_modules/vanilla-test/index.js';

const test=new VanillaTest;

//setup
const num1=1;
const num2=2;
function sum(a,b){
    return a+b;
}

//helper functions
const expectTypeErr=(err)=>{
    try{
        test.is.typeError(err);
    }catch(err){
        console.log(`${err.name} : ${err.message}`);
        test.fail();
    }
    test.pass();
}


// 1) expects num1 to be a number
try{
    test.expects('num1 to be a number');    
    test.is.number(num1);
}catch(err){
    console.log(`${err.name} : ${err.message}`);
    test.fail();
}
test.pass();
test.done();



// 2) expects num2 to be a a number
try{
    test.expects('num2 to be a a number');    
    test.is.number(num2);
}catch(err){
    console.log(`${err.name} : ${err.message}`);
    test.fail();
}
test.pass();
test.done();



// 3) expects num1 !== num2
try{
    test.expects('num1 == num2');    
    test.is.compare(num1,num2);
}catch(err){
    console.log(`test.is.compare(${num1},${num2}); : num1 and num2 were not equal`);
    test.pass();
}
test.fail();
test.done();



// 4) expects sum(num1,num2) to be equal to num1+num2
try{
    test.expects('sum(num1,num2) to be equal to num1+num2');    

    test.is.compare(
        sum(num1,num2),
        num1+num2
    );
}catch(err){
    console.log(`sum(${num1},${num2}); ${sum(num1,num2)} was not equal to ${num1}+${num2}=${num1+num2}`);
    test.fail();
}
test.pass();
test.done();



// 5) expects A TypeError when type checks fail
try{
    test.expects('A TypeError when type checks fail');    
    test.boolean(new Array(2));
}catch(err){
    expectTypeErr(err);
}
test.fail();
test.done();



// 6) expects .delay to throw a TypeError if arg is not a number
try{
    test.expects('.delay to throw a type err if arg is not a number');    
    test.delay('test');
}catch(err){
    expectTypeErr(err);
}
test.fail();
test.done();

test.report();