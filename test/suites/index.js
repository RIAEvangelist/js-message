import functional from './functional.js';
import integration from './integration.js';
import regression from './regression.js';
import unit from './unit.js';

const suites = Object.freeze([
    unit,
    functional,
    integration,
    regression
]);

const catalog = Object.freeze(suites.map(({ cases, id, name }) => Object.freeze({
    cases: Object.freeze(cases.map(({ description, id: caseId }) => Object.freeze({
        description,
        id: caseId
    }))),
    id,
    name,
    total: cases.length
})));

export {
    catalog,
    suites
};
