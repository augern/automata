# Scoping and environments: example programs (draft)

Outputs were worked out by hand; the interpreter's tests will confirm them.

## Language

```
var x = e;                      declaration with initial value
array a[lo..hi] = {e, …};       or without the list (zeros); an array variable holds a reference
proc p(f1, f2) { … }            may nest
func f(f1) { … return e; }
x = e;   a[e] = e;   call p(args);   print e;   return e;
if (e) { … } else { … }    while (e) { … }    { … }   a block: a new scope
```

Expressions: integers, `+ - * /`, comparisons, `a[e]`, calls of functions.

Rules the examples rely on:

- The passing mode and the scoping rule are chosen in the tool, not in the program.
- Arguments are evaluated left to right. The location of an l-value argument (`i`, `a[i]`) is fixed at the call.
- Reference or value-result with an argument that is not an l-value: the value goes into a temporary.
- Value-result copies out in parameter order, left to right.
- Name: the argument is a thunk. Static scoping gives it the caller's environment; dynamic scoping evaluates it where it is used. Assigning to a name formal assigns to the argument's l-value; for any other argument it is an error.
- A run stops after a step limit.

## 1. Identifiers, locations, values

### 1.1 One identifier, two locations (a block)

```
var x = 1;
{ var x = 2; print x; }
print x;
```

All configurations: `2 1`.

### 1.2 One identifier, many locations (recursion)

```
proc f(n) {
  var x = n;
  if (n > 0) { call f(n - 1); }
  print x;
}
call f(2);
```

All configurations: `0 1 2`.

## 2. Scoping rules (parameter mode: value)

### 2.1 A free name

```
var x = 1;
proc f() { print x; }
proc g() { var x = 2; call f(); }
call g();
call f();
```

| static | dynamic |
|---|---|
| `1 1` | `2 1` |

### 2.2 Definition nesting against call chain

```
var n = 10;
proc outer() {
  var n = 20;
  proc inner() { print n; }
  proc middle() { var n = 30; call inner(); }
  call middle();
}
call outer();
```

| static | dynamic |
|---|---|
| `20` | `30` |

### 2.3 A parameter captures a free name

```
var limit = 3;
proc show() { print limit; }
proc run(limit) { call show(); }
call run(99);
call show();
```

| static | dynamic |
|---|---|
| `3 3` | `99 3` |

## 3. Parameter passing (scoping: static)

V value, R reference, VR value-result, N name.

### 3.1 Aliasing a global

```
var g = 0;
proc p(a) { a = a + 1; g = g + 10; print a; }
call p(g);
print g;
```

| V | R | VR | N |
|---|---|---|---|
| `1 10` | `11 11` | `1 1` | `11 11` |

### 3.2 Swap

```
var x = 1;
var y = 2;
proc swap(a, b) { var t = a; a = b; b = t; }
call swap(x, y);
print x;
print y;
```

| V | R | VR | N |
|---|---|---|---|
| `1 2` | `2 1` | `2 1` | `2 1` |

### 3.3 Aliased arguments and the copy-out order

```
var x = 0;
proc p(a, b) { a = 1; }
call p(x, x);
print x;
```

| V | R | VR | N |
|---|---|---|---|
| `0` | `1` | `0` | `1` |

VR: `b` is copied out after `a` and restores the old value.

### 3.4 `swap(i, a[i])`

```
var i = 1;
array a[1..2] = {10, 20};
proc swap(p, q) { var t = p; p = q; q = t; }
call swap(i, a[i]);
print i;
print a[1];
print a[2];
```

| V | R | VR | N |
|---|---|---|---|
| `1 10 20` | `10 1 20` | `10 1 20` | error: `a[10]` out of range, after `i` became 10 |

N: the thunk for `a[i]` is evaluated again after `p = q` changed `i`.

### 3.5 Evaluations and side effects

```
var n = 0;
func tick() { n = n + 1; return n; }
func twice(x) { return x + x; }
print twice(tick());
print n;
```

| V | R | VR | N |
|---|---|---|---|
| `2 1` | `2 1` | `2 1` | `3 2` |

### 3.6 An argument that is never used

```
func loop() { while (1 == 1) { } return 0; }
func first(a, b) { return a; }
print first(7, loop());
```

| V | R | VR | N |
|---|---|---|---|
| step limit | step limit | step limit | `7` |

### 3.7 Jensen's device

```
var i = 1;
array a[1..4] = {1, 2, 3, 4};
func sum(k, lo, hi, term) {
  var s = 0;
  k = lo;
  while (k <= hi) { s = s + term; k = k + 1; }
  return s;
}
print sum(i, 1, 4, a[i]);
print sum(i, 1, 4, a[i] * a[i]);
```

| V | R | VR | N |
|---|---|---|---|
| `4 4` | `4`, then error: `a[5]` out of range | `4`, then error: `a[5]` out of range | `10 30` |

R and VR: the first call leaves `i` at 5, and the second call evaluates its argument with it.

### 3.8 Passing an array

```
array a[1..3] = {1, 2, 3};
proc clear(v) { v[1] = 0; }
proc replace(v) { array w[1..3] = {9, 9, 9}; v = w; }
call clear(a);
print a[1];
call replace(a);
print a[1];
```

| V | R | VR | N |
|---|---|---|---|
| `0 0` | `0 9` | `0 9` | `0 9` |

V is what Java and Python call passing by sharing: the reference is copied, so the element changes are seen and the rebinding is not.

## 4. Both axes

### 4.1 A thunk and the callee's local

```
var t = 5;
proc p(a) { var t = 100; print a; }
call p(t + 1);
```

| | static | dynamic |
|---|---|---|
| V, R, VR | `6` | `6` |
| N | `6` | `101` |

## Open points

1. Arrays are references in every mode. This drops Pascal-style copying of an array argument, and makes value mode the same as sharing.
2. Call by need is left out: with assignment, its meaning for an l-value argument is unclear.
3. Value-result with the location fixed at the call, copying out left to right, is one choice among several (the order can be a switch).
4. Recursion with nested procedures and static links (a function called through three levels) is not yet an example.
