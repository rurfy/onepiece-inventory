import 'dart:async';
import 'package:flutter/material.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:http/http.dart' as http;
import 'firebase_options.dart';

/// ========= CONFIG =========
const bool kUserScopedInventory = true; // inventory/{uid}/cards/{print_id}
const String kCloudFunctionBase =
    'https://YOUR_REGION-YOUR_PROJECT.cloudfunctions.net'; // e.g. https://europe-west1-one-piece-card-database.cloudfunctions.net

CollectionReference<Map<String, dynamic>> inventoryCol() {
  final db = FirebaseFirestore.instance;
  if (kUserScopedInventory) {
    final uid = FirebaseAuth.instance.currentUser?.uid;
    if (uid == null) throw StateError('Not signed in');
    return db.collection('inventory').doc(uid).collection('cards');
  }
  return db.collection('inventory');
}

DocumentReference<Map<String, dynamic>> printsDoc(String printId) =>
    FirebaseFirestore.instance.collection('prints').doc(printId);
DocumentReference<Map<String, dynamic>> pricesDoc(String printId) =>
    FirebaseFirestore.instance.collection('prices').doc(printId);

Future<void> ensureAuth() async {
  final auth = FirebaseAuth.instance;
  if (auth.currentUser == null) {
    final cred = await auth.signInAnonymously();
    // ignore: avoid_print
    print('✅ Signed in as ${cred.user?.uid}');
  } else {
    // ignore: avoid_print
    print('✅ Already signed in as ${auth.currentUser!.uid}');
  }
}

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Firebase.initializeApp(options: DefaultFirebaseOptions.currentPlatform);
  await ensureAuth();
  FirebaseFirestore.instance.settings = const Settings(persistenceEnabled: true);
  runApp(const OnePieceApp());
}

class OnePieceApp extends StatelessWidget {
  const OnePieceApp({super.key});
  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'One Piece Inventory',
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: Colors.red),
        useMaterial3: true,
      ),
      home: const InventoryListPage(),
    );
  }
}

/// ========= MODELS / ENUMS =========
enum ViewMode { list, grid }

enum SortBy { baseCode, name, quantity, price }
enum SortDir { asc, desc }

/// ========= LIST PAGE =========
class InventoryListPage extends StatefulWidget {
  const InventoryListPage({super.key});
  @override
  State<InventoryListPage> createState() => _InventoryListPageState();
}

class _InventoryListPageState extends State<InventoryListPage> {
  String _query = '';
  ViewMode _viewMode = ViewMode.list;
  SortBy _sortBy = SortBy.baseCode;
  SortDir _sortDir = SortDir.asc;

  // simple in-memory price cache: printId -> price
  final Map<String, double?> _priceCache = {};
  final Set<String> _priceRequestsInFlight = {};

  bool _looksLikeCodePrefix(String s) {
    final u = s.toUpperCase();
    final re = RegExp(r'^(OP|ST|EB|PRB)\d{0,2}(-\d{0,3})?$');
    return re.hasMatch(u);
  }

  Stream<QuerySnapshot<Map<String, dynamic>>> _invStreamByPrefix(String prefix) {
    final col = inventoryCol();
    if (prefix.isEmpty) return col.orderBy('base_code').limit(300).snapshots();
    final start = prefix.toUpperCase();
    final last = start.codeUnitAt(start.length - 1);
    final end = start.substring(0, start.length - 1) + String.fromCharCode(last + 1);
    return col.orderBy('base_code').startAt([start]).endBefore([end]).limit(300).snapshots();
  }

  Future<void> _incrementQty(String printId) async {
    final ref = inventoryCol().doc(printId);
    await ref.set({
      'quantity': FieldValue.increment(1),
      'lastUpdated': DateTime.now().millisecondsSinceEpoch ~/ 1000,
    }, SetOptions(merge: true));
  }

  Future<void> _decrementQty(String printId) async {
    final ref = inventoryCol().doc(printId);
    await FirebaseFirestore.instance.runTransaction((tx) async {
      final snap = await tx.get(ref);
      final cur = (snap.data()?['quantity'] ?? 0) as int;
      final next = cur - 1;
      if (next <= 0) {
        tx.delete(ref);
      } else {
        tx.update(ref, {
          'quantity': next,
          'lastUpdated': DateTime.now().millisecondsSinceEpoch ~/ 1000
        });
      }
    });
  }

  // Fetch prices/{print_id} once and cache. Returns null if no price.
  Future<double?> _fetchPrice(String printId) async {
    if (_priceCache.containsKey(printId)) return _priceCache[printId];
    if (_priceRequestsInFlight.contains(printId)) return null;
    _priceRequestsInFlight.add(printId);
    try {
      final doc = await pricesDoc(printId).get();
      final v = doc.data()?['market_price'];
      final price = (v is num) ? v.toDouble() : null;
      _priceCache[printId] = price;
      if (mounted) setState(() {}); // refresh sorting/render
      return price;
    } finally {
      _priceRequestsInFlight.remove(printId);
    }
  }

  // For list sorting, get cached price (sync); trigger fetch if missing.
  double _getPriceForSort(String printId) {
    final cached = _priceCache[printId];
    if (cached == null && !_priceRequestsInFlight.contains(printId)) {
      // fire & forget
      _fetchPrice(printId);
    }
    return cached ?? -1.0; // unknowns sort to bottom (asc) / top (desc) depending on comparator
  }

  // Sorting comparator based on current _sortBy/_sortDir
  int _compareDocs(QueryDocumentSnapshot<Map<String, dynamic>> a,
      QueryDocumentSnapshot<Map<String, dynamic>> b) {
    final ma = a.data();
    final mb = b.data();
    int cmp = 0;
    switch (_sortBy) {
      case SortBy.baseCode:
        cmp = (ma['base_code'] ?? '').toString().compareTo((mb['base_code'] ?? '').toString());
        break;
      case SortBy.name:
        cmp = (ma['name'] ?? '').toString().compareTo((mb['name'] ?? '').toString());
        break;
      case SortBy.quantity:
        final qa = (ma['quantity'] ?? 0) as int;
        final qb = (mb['quantity'] ?? 0) as int;
        cmp = qa.compareTo(qb);
        break;
      case SortBy.price:
        final pa = _getPriceForSort(a.id);
        final pb = _getPriceForSort(b.id);
        cmp = pa.compareTo(pb);
        break;
    }
    return _sortDir == SortDir.asc ? cmp : -cmp;
  }

  // UI bits
  void _toggleViewMode() {
    setState(() {
      _viewMode = _viewMode == ViewMode.list ? ViewMode.grid : ViewMode.list;
    });
  }

  void _chooseSort(BuildContext context) async {
    final choice = await showModalBottomSheet<_SortChoice>(
      context: context,
      showDragHandle: true,
      builder: (_) => _SortSheet(currentBy: _sortBy, currentDir: _sortDir),
    );
    if (choice != null) {
      setState(() {
        _sortBy = choice.by;
        _sortDir = choice.dir;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final stream = _looksLikeCodePrefix(_query)
        ? _invStreamByPrefix(_query)
        : inventoryCol().orderBy('base_code').limit(300).snapshots();

    return Scaffold(
      appBar: AppBar(
        title: const Text('One Piece Inventory'),
        actions: [
          IconButton(
            tooltip: _viewMode == ViewMode.list ? 'Grid view' : 'List view',
            onPressed: _toggleViewMode,
            icon: Icon(_viewMode == ViewMode.list ? Icons.grid_view : Icons.view_list),
          ),
          IconButton(
            tooltip: 'Sort',
            onPressed: () => _chooseSort(context),
            icon: const Icon(Icons.sort),
          ),
        ],
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(56),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
            child: TextField(
              onChanged: (v) => setState(() => _query = v.trim().toUpperCase()),
              decoration: InputDecoration(
                prefixIcon: const Icon(Icons.search),
                hintText: 'Search by code prefix (e.g., OP12-0)…',
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                isDense: true,
              ),
            ),
          ),
        ),
      ),
      body: StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
        stream: stream,
        builder: (context, snap) {
          if (snap.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snap.hasError) {
            return Center(child: Text('Error: ${snap.error}'));
          }

          var docs = snap.data?.docs ?? [];
          if (docs.isEmpty) {
            return const Center(child: Text('No inventory yet.'));
          }

          // local sort (uses cached prices for price sorting)
          docs = [...docs]..sort(_compareDocs);

          return _viewMode == ViewMode.list
              ? _buildListView(context, docs)
              : _buildGridView(context, docs);
        },
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () {
          ScaffoldMessenger.of(context)
              .showSnackBar(const SnackBar(content: Text('Scanner coming soon…')));
        },
        label: const Text('Scan'),
        icon: const Icon(Icons.camera_alt),
      ),
    );
  }

  Widget _buildListView(BuildContext context, List<QueryDocumentSnapshot<Map<String, dynamic>>> docs) {
    return ListView.separated(
      itemCount: docs.length,
      separatorBuilder: (_, __) => const Divider(height: 1),
      itemBuilder: (context, i) {
        final doc = docs[i];
        final m = doc.data();
        final printId = doc.id;

        final baseCode = (m['base_code'] ?? '').toString();
        final name = (m['name'] ?? '').toString();
        final setId = (m['set_id'] ?? '').toString();
        final rarity = (m['rarity'] ?? '').toString();
        final color = (m['color'] ?? '').toString();
        final imageUrl = (m['image_url'] ?? '').toString();
        final qty = (m['quantity'] ?? 0) as int;

        final price = _priceCache[printId];
        final priceStr = price == null ? '—' : price.toStringAsFixed(2);

        return ListTile(
          leading: imageUrl.isNotEmpty
              ? ClipRRect(
                  borderRadius: BorderRadius.circular(8),
                  child: Image.network(imageUrl, width: 44, height: 62, fit: BoxFit.cover),
                )
              : const SizedBox(width: 44, height: 62),
          title: Text(
            '${baseCode.isNotEmpty ? baseCode : printId} • ${name.isNotEmpty ? name : printId}',
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
          subtitle: Text(
            [
              if (setId.isNotEmpty) setId,
              if (rarity.isNotEmpty) rarity,
              if (color.isNotEmpty) color,
              'Price: $priceStr',
            ].join('  •  '),
          ),
          trailing: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              IconButton(
                tooltip: 'Decrease',
                onPressed: () => _decrementQty(printId),
                icon: const Icon(Icons.remove_circle_outline),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                decoration: BoxDecoration(
                  color: Theme.of(context).colorScheme.primaryContainer,
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Text('$qty'),
              ),
              IconButton(
                tooltip: 'Increase',
                onPressed: () => _incrementQty(printId),
                icon: const Icon(Icons.add_circle_outline),
              ),
            ],
          ),
          onTap: () {
            Navigator.of(context).push(MaterialPageRoute(
              builder: (_) => InventoryDetailPage(printId: printId, invData: m),
            ));
          },
        );
      },
    );
  }

  Widget _buildGridView(BuildContext context, List<QueryDocumentSnapshot<Map<String, dynamic>>> docs) {
    final size = MediaQuery.of(context).size;
    final crossAxisCount = size.width ~/ 140.0; // approx 140px cards
    return GridView.builder(
      padding: const EdgeInsets.all(8),
      gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: crossAxisCount.clamp(2, 8),
        childAspectRatio: 0.66, // card-ish
        mainAxisSpacing: 8,
        crossAxisSpacing: 8,
      ),
      itemCount: docs.length,
      itemBuilder: (context, i) {
        final doc = docs[i];
        final m = doc.data();
        final printId = doc.id;

        final baseCode = (m['base_code'] ?? '').toString();
        final name = (m['name'] ?? '').toString();
        final imageUrl = (m['image_url'] ?? '').toString();
        final qty = (m['quantity'] ?? 0) as int;

        final price = _priceCache[printId];
        final priceStr = price == null ? '—' : price.toStringAsFixed(2);

        return InkWell(
          onTap: () {
            Navigator.of(context).push(MaterialPageRoute(
              builder: (_) => InventoryDetailPage(printId: printId, invData: m),
            ));
          },
          child: Card(
            clipBehavior: Clip.antiAlias,
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Expanded(
                  child: imageUrl.isNotEmpty
                      ? Image.network(imageUrl, fit: BoxFit.cover)
                      : Container(color: Theme.of(context).colorScheme.surfaceVariant),
                ),
                Padding(
                  padding: const EdgeInsets.fromLTRB(8, 6, 8, 6),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(baseCode.isNotEmpty ? baseCode : printId,
                          maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w600)),
                      Text(name, maxLines: 1, overflow: TextOverflow.ellipsis),
                      const SizedBox(height: 4),
                      Row(
                        children: [
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                            decoration: BoxDecoration(
                              color: Theme.of(context).colorScheme.secondaryContainer,
                              borderRadius: BorderRadius.circular(6),
                            ),
                            child: Text('Qty: $qty'),
                          ),
                          const SizedBox(width: 8),
                          Text('€$priceStr'), // or USD; depends on your prices
                          const Spacer(),
                          IconButton(
                            visualDensity: VisualDensity.compact,
                            onPressed: () => _incrementQty(printId),
                            icon: const Icon(Icons.add_circle_outline),
                          ),
                          IconButton(
                            visualDensity: VisualDensity.compact,
                            onPressed: () => _decrementQty(printId),
                            icon: const Icon(Icons.remove_circle_outline),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }
}

/// ========= DETAIL PAGE =========
class InventoryDetailPage extends StatelessWidget {
  final String printId;
  final Map<String, dynamic> invData;
  const InventoryDetailPage({super.key, required this.printId, required this.invData});

  Future<void> _refreshPrice(BuildContext context) async {
    final uri = Uri.parse('$kCloudFunctionBase/priceRefresh').replace(queryParameters: {'print_id': printId});
    try {
      final res = await http.get(uri).timeout(const Duration(seconds: 15));
      if (res.statusCode == 200) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Price refreshed')));
      } else {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Refresh failed (${res.statusCode})')));
      }
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Refresh error: $e')));
    }
  }

  @override
  Widget build(BuildContext context) {
    final denormImage = (invData['image_url'] ?? '').toString();
    final pStream = printsDoc(printId).snapshots();
    final rStream = pricesDoc(printId).snapshots();

    return Scaffold(
      appBar: AppBar(
        title: Text(printId),
        actions: [
          IconButton(onPressed: () => _refreshPrice(context), icon: const Icon(Icons.refresh)),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          if (denormImage.isNotEmpty)
            ClipRRect(
              borderRadius: BorderRadius.circular(12),
              child: Image.network(denormImage, height: 260, fit: BoxFit.cover),
            ),
          const SizedBox(height: 16),

          StreamBuilder<DocumentSnapshot<Map<String, dynamic>>>(
            stream: pStream,
            builder: (context, snap) {
              final p = snap.data?.data() ?? {};
              final name = (p['name'] ?? invData['name'] ?? printId).toString();
              final baseCode = (p['base_code'] ?? invData['base_code'] ?? '').toString();
              final setId = (p['set_id'] ?? invData['set_id'] ?? '').toString();
              final rarity = (p['rarity'] ?? invData['rarity'] ?? '').toString();
              final color = (p['color'] ?? invData['color'] ?? '').toString();
              final type = (p['type'] ?? '').toString();
              final power = (p['power'] ?? '').toString();
              final cost = (p['cost'] ?? '').toString();
              final cardText = (p['card_text'] ?? '').toString();
              final qty = (invData['quantity'] ?? 0).toString();

              return Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(name, style: Theme.of(context).textTheme.headlineSmall),
                  const SizedBox(height: 8),
                  Text('Base: $baseCode   •   Set: $setId'),
                  const SizedBox(height: 4),
                  Text('Rarity: $rarity   •   Color: $color'),
                  const SizedBox(height: 4),
                  Text('Type: $type   •   Cost: $cost   •   Power: $power'),
                  const SizedBox(height: 12),
                  if (cardText.isNotEmpty) Text(cardText),
                  const SizedBox(height: 12),
                  Text('Quantity: $qty'),
                  const SizedBox(height: 12),
                  if (baseCode.isNotEmpty)
                    _VariantStrip(baseCode: baseCode, currentPrintId: printId),
                ],
              );
            },
          ),

          const SizedBox(height: 16),

          StreamBuilder<DocumentSnapshot<Map<String, dynamic>>>(
            stream: rStream,
            builder: (context, snap) {
              final pr = snap.data?.data() ?? {};
              final mk = pr['market_price'];
              final inv = pr['inventory_price'];
              final fetchedAt = pr['fetchedAt'];
              final dt = fetchedAt == null
                  ? ''
                  : DateTime.fromMillisecondsSinceEpoch((fetchedAt as int) * 1000).toLocal().toString();
              return Text('Market: ${mk ?? "-"}  •  Inventory: ${inv ?? "-"}  •  Fetched: $dt');
            },
          ),
        ],
      ),
    );
  }
}

class _VariantStrip extends StatelessWidget {
  final String baseCode;
  final String currentPrintId;
  const _VariantStrip({required this.baseCode, required this.currentPrintId});

  @override
  Widget build(BuildContext context) {
    final q = FirebaseFirestore.instance
        .collection('prints')
        .where('base_code', isEqualTo: baseCode)
        .orderBy('variant_key');

    return StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
      stream: q.snapshots(),
      builder: (context, snap) {
        final items = snap.data?.docs ?? [];
        if (items.isEmpty) return const SizedBox.shrink();

        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Variants'),
            const SizedBox(height: 8),
            SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Row(
                children: items.map((d) {
                  final id = d.id;
                  final m = d.data();
                  final label = (m['variant_label'] ?? m['variant_key'] ?? 'base').toString();
                  final selected = id == currentPrintId;
                  return Padding(
                    padding: const EdgeInsets.only(right: 8),
                    child: ChoiceChip(
                      label: Text(label.isEmpty ? 'base' : label),
                      selected: selected,
                      onSelected: (_) {
                        if (!selected) {
                          Navigator.of(context).pushReplacement(MaterialPageRoute(
                            builder: (_) => InventoryDetailPage(printId: id, invData: const {}),
                          ));
                        }
                      },
                    ),
                  );
                }).toList(),
              ),
            ),
          ],
        );
      },
    );
  }
}

/// ========= SORT SHEET =========
class _SortChoice {
  final SortBy by;
  final SortDir dir;
  const _SortChoice(this.by, this.dir);
}

class _SortSheet extends StatefulWidget {
  final SortBy currentBy;
  final SortDir currentDir;
  const _SortSheet({required this.currentBy, required this.currentDir});
  @override
  State<_SortSheet> createState() => _SortSheetState();
}

class _SortSheetState extends State<_SortSheet> {
  late SortBy _by = widget.currentBy;
  late SortDir _dir = widget.currentDir;

  Widget _radio<T>(String label, T value, T groupValue, void Function(T?) onChanged) {
    return RadioListTile<T>(
      title: Text(label),
      value: value,
      groupValue: groupValue,
      onChanged: onChanged,
      dense: true,
    );
  }

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text('Sort by', style: TextStyle(fontWeight: FontWeight.bold)),
            _radio<SortBy>('Base code', SortBy.baseCode, _by, (v) => setState(() => _by = v!)),
            _radio<SortBy>('Name', SortBy.name, _by, (v) => setState(() => _by = v!)),
            _radio<SortBy>('Quantity', SortBy.quantity, _by, (v) => setState(() => _by = v!)),
            _radio<SortBy>('Market price', SortBy.price, _by, (v) => setState(() => _by = v!)),
            const Divider(),
            const Text('Direction', style: TextStyle(fontWeight: FontWeight.bold)),
            _radio<SortDir>('Ascending', SortDir.asc, _dir, (v) => setState(() => _dir = v!)),
            _radio<SortDir>('Descending', SortDir.desc, _dir, (v) => setState(() => _dir = v!)),
            const SizedBox(height: 8),
            FilledButton(
              onPressed: () => Navigator.of(context).pop(_SortChoice(_by, _dir)),
              child: const Text('Apply'),
            ),
          ],
        ),
      ),
    );
  }
}
