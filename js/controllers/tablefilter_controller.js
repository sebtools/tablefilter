application.register('tablefilter', class extends Stimulus.Controller {
	static targets = ["filter","table"];

	initialize() {

		this.dispatch("initialized");

	}

	connect() {

		this.config();

		//Attaching controller to object so we can call methods on it.
		this.element[this.identifier] = this;
		
		this._runWaitingCode(
			() =>  this.setUp()
		);

		this.dispatch("connected");

	}

	disconnect() {

		this.dispatch("disconnected");

	}

	config() {
		//Make sure the table target is set
		if ( !this.hasTableTarget ) {
			if ( this.element.tagName.toLowerCase() === 'table' ) {
				//If the element is a table, then set it as the table target
				this.element.setAttribute('data-tablefilter-target', 'table');
			} else if ( this.element.querySelectorAll('table').length === 1 ) {
				//If there is only one table in the element, then set it as the table target
				this.element.querySelector('table').setAttribute('data-tablefilter-target', 'table');
			} else {
				//If there is no single table, then throw an error
				throw new Error('Table Filter requires a table target.');
			}

		}

	}

	setUp() {
		this._setUpTableHeadBody();
		this._setUpTableFilters();
		this._setUpFilterTargets();
	}
	
	busy(isBusy) {
		this.element.ariaBusy = isBusy;

	}

	filter() {
		this.dispatch("filtering");

		//Run the filter code
		this._runWaitingCode(
			() => this._filter()
		);

		this.dispatch("filtered");

	}

	getCellValue(td) {
		var result = "";
		var inputs = td.getElementsByTagName("input");

		if ( td.hasAttribute("data-value") ) {
			result = td.getAttribute("data-value");
		} else if ( td.textContent.length == 0 && inputs.length == 1 ) {
			result = inputs[0].value;
		} else {
			result = td.textContent;
		}

		result = result.trim();

		result = this._stripNumericCommas(result);

		if ( typeof result !== 'string' ) {
			result = String(result);
		}

		return result;
	}

	getColNameIndex(name) {
		let aNames = this.tableTarget.querySelectorAll('[data-tablefilter-colname]:not([data-tablefilter-target="filter"])');
		let result = -1;

		aNames.forEach((element, index) => {
			if ( element.getAttribute('data-tablefilter-colname') === name ) {
				result = element.cellIndex;
			}
		});

		return result;
	}

	getFilters() {
		var aFilterFields = this.element.querySelectorAll('[data-tablefilter-target="filter"]');
		var aFilters = [];
		aFilterFields.forEach(filter => {
			var oFilter = {};
			oFilter.value = filter.value;
			
			if ( filter.hasAttribute('data-tablefilter-colindex') ) {
				oFilter.colidx = parseInt(filter.getAttribute('data-tablefilter-colindex'));
			} else if ( filter.hasAttribute('data-tablefilter-colnum') ) {
				oFilter.colidx = parseInt(filter.getAttribute('data-tablefilter-colnum'));
				oFilter.colidx--; //Decrement by one to make it zero based
			} else if ( filter.hasAttribute('data-tablefilter-colname') ) {
				oFilter.colidx = this.getColNameIndex(filter.getAttribute('data-tablefilter-colname'));
			} else if ( filter.parentElement.cellIndex != undefined ) {
				oFilter.colidx = filter.parentElement.cellIndex;
			}
			
			//If the column index is not a valid column, then remove it
			if (
				oFilter.hasOwnProperty('colidx')
				&&
				(oFilter.colidx < 0 || oFilter.colidx >= this.tableTarget.rows[0].cells.length)
			) {
				delete oFilter.colidx;
			}

			if ( !oFilter.hasOwnProperty('colidx') ) {
				console.warn('Unable to determine column to sort for filter.');
			}

			aFilters.push(oFilter);
		});

		return aFilters;
	}

	//Private methods

	_filter() {
		
		//Get the filters
		var aFilters = this.getFilters();

		//Get the rows
		let rows = this.tableTarget.querySelectorAll('tbody tr');

		//Loop through the rows and hide the ones that don't match the filter
		rows.forEach(row => {
			let shouldHide = aFilters.some(filter => {
				//If the filter doesn't have a column index, then don't filter
				if ( !filter.hasOwnProperty('colidx') ) return false;

				let cell = row.cells[filter.colidx];
				return cell && !this.getCellValue(cell).toLowerCase().includes(filter.value.toLowerCase());
			});
			row.style.display = shouldHide ? 'none' : '';
		});

	}

	//I get the filter additions for each column
	_getFilterAdditions() {
		var aColumns = this.tableTarget.getElementsByTagName('thead')[0].getElementsByTagName('th');
		var aFilterAdditions = [];
		var cols = this.tableTarget.getElementsByTagName('col');

		for ( var ii = 0; ii < aColumns.length; ii++ ) {
			var sFilterAddition = {};
			
			if ( aColumns[ii].hasAttribute('data-tablefilter-addfilter') ) {
				sFilterAddition.add = aColumns[ii].getAttribute('data-tablefilter-addfilter');
			} else if ( cols.length > ii && cols[ii].hasAttribute('data-tablefilter-addfilter') ) {
				sFilterAddition.add = cols[ii].getAttribute('data-tablefilter-addfilter');
			} else if( this.tableTarget.hasAttribute('data-tablefilter-addfilters') ) {
				sFilterAddition.add = this.tableTarget.getAttribute('data-tablefilter-addfilters');
			} else {
				sFilterAddition.add = !this.hasFilterTarget;
			}

			aFilterAdditions.push(sFilterAddition);
		}

		return aFilterAdditions;
	}

	_runWaitingCode(func) {
		this.busy(true);
		
		/*
		This makes sure that there is a tiny bit of idle time before executing this code and the false
		This allows the browser to paint any style on aria-busy="true".
		Without this, the browser doesn't get the opportunity to paint the change while it is processing - seeming unresponsive.
		(only matters for very large tables)
		*/
		setTimeout(() => {
			func();
			this.busy(false);
		}, 0);

	}

	//I add a data-action to each filter target that doesn't already have one
	_setUpFilterTargets() {
		let aFilters = this.element.querySelectorAll('[data-tablefilter-target="filter"]');
		aFilters.forEach(filter => {
			if ( !filter.hasAttribute('data-action') ) {
				filter.setAttribute('data-action', 'tablefilter#filter');
			}
		});
	}

	//I add the filter inputs to the table
	_setUpTableFilters() {
		//If the table has data-tablefilter-addfilters="false" then don't add filters
		if (
			this.tableTarget.hasAttribute('data-tablefilter-addfilters')
			&&
			this.tableTarget.getAttribute('data-tablefilter-addfilters') === 'false'
		) {
			return;
		}

		//Get the columns and the filter additions
		let aFilterAdditions = this._getFilterAdditions();
		aFilterAdditions.forEach(filterAddition => {
			filterAddition.add = filterAddition.add === true;
		});
		let hasFilterAdditions = aFilterAdditions.some(filterAddition => filterAddition.add === true);

		//If there are any filters, then add a row to the table head
		if ( hasFilterAdditions ) {
			let tr = document.createElement('tr');
			aFilterAdditions.forEach(filterAddition => {
				let td = document.createElement('td');
				//Add a filter input for every column than needs one
				if ( filterAddition.add ) {
					let input = document.createElement('input');
					input.type = 'text';
					input.setAttribute('data-tablefilter-target', 'filter');
					td.appendChild(input);
				}
				tr.appendChild(td);
			});
			this.tableTarget.querySelector('thead').appendChild(tr);
		}
	}

	_setUpTableHeadBody() {
		/*
			This change could break code relying on the structure of the table.
			So, we have a data-sort-table-auto-head="true" option so that the author can approve the change.
		*/

		var theads = this.tableTarget.getElementsByTagName('thead');

		//Only need to add a head if there isn't one already
		if ( !theads.length ) {
			
			if ( !this.autoHeadValue ) {
				throw new Error('Sort Table can only sort tables with a thead element. Please add one or add data-sort-table-auto-head="true" to the table and Data Sort will make the first row a thead.');
			}

			var trs = this.tableTarget.getElementsByTagName('tr');
			var thead_new = document.createElement("thead");

			if ( trs.length ) {

				//Put first row in head (figured I'd need to remove it from somewhere, but apparently not)
				thead_new.appendChild(trs[0]);
				
				//Add head to table
				this.tableTarget.insertBefore(thead_new, this.tableTarget.firstChild)
	
			}
			
		}

	}

	_stripNumericCommas(str) {
		const regex = /^\d{1,3}(,\d{3})*(\.\d+)?$/;
		const match = str.match(regex);

		if ( match ) {
			return parseFloat(str.replace(/,/g,""))
		} else {
			return str;
		}
	}

})